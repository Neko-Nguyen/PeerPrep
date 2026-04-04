package com.g13cs3219.matching_service.repositories;

import java.util.Optional;
import java.util.Set;

import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Component;

import com.g13cs3219.matching_service.dto.requests.JoinRequest;
import com.g13cs3219.matching_service.dto.responses.MatchResult;
import com.g13cs3219.matching_service.services.MessageService;

import lombok.AllArgsConstructor;

@Component
@AllArgsConstructor
public class MatchingPool {

    private final RedisTemplate<String, String> redisTemplate;
    private final MessageService messageService;

    /**
     * Add a user to the matching pool based on the provided join request.
     */
    public void addUser(JoinRequest request) {
        String key = buildKey(request.getTopic(), request.getDifficulty());
        redisTemplate.opsForZSet().add(
                key,
                String.valueOf(request.getUserId()),
                System.currentTimeMillis()
        );
    }

    /**
     * Remove a user from the matching pool based on the provided join request.
     */
    public void removeUser(JoinRequest request) {
        String key = buildKey(request.getTopic(), request.getDifficulty());
        messageService.sendCancelMessage(String.valueOf(request.getUserId()));
        redisTemplate.opsForZSet().remove(key, String.valueOf(request.getUserId()));
    }

    /**
     * Find a match for a user based on the specified topic and difficulty.
     */
    public Optional<MatchResult> findMatch(int userId, String topic, String difficulty, String type) {
        String key = buildKey(topic, difficulty);
        Optional<MatchResult> match = findExactMatch(userId, key);
        if (match.isPresent()) return match;
        match = findSameDifficultyMatch(userId, difficulty);
        if (type.equals("match") || match.isPresent()) return match;

        String lowerDiff = getLowerDifficulty(difficulty);
        if (lowerDiff != null) {
            match = findExactMatch(userId, buildKey(topic, lowerDiff));
            if (match.isPresent()) return match;
        }

        String higherDiff = getHigherDifficulty(difficulty);
        if (higherDiff != null) {
            match = findExactMatch(userId, buildKey(topic, higherDiff));
            if (match.isPresent()) return match;
        }

        if (lowerDiff != null) {
            match = findSameDifficultyMatch(userId, lowerDiff);
            if (match.isPresent()) return match;
        }

        if (higherDiff != null) {
            match = findSameDifficultyMatch(userId, higherDiff);
            if (match.isPresent()) return match;
        }

        return Optional.empty();
    }

    /**
     * Handle timeouts for users in the matching pool.
     */
    public void handleTimeouts(double currentTime) {
        ScanOptions options = ScanOptions.scanOptions().match("queue:*").count(100).build();
        Cursor<byte[]> cursor = redisTemplate.getConnectionFactory().getConnection().scan(options);
        while (cursor.hasNext()) {
            String key = new String(cursor.next());
            Set<ZSetOperations.TypedTuple<String>> timedOutUsers = redisTemplate
                    .opsForZSet()
                    .rangeByScoreWithScores(key, 0, currentTime - 30000);

            if (timedOutUsers != null) {
                for (ZSetOperations.TypedTuple<String> user : timedOutUsers) {
                    String userId = user.getValue();
                    messageService.sendTimeoutMessage(userId);
                    redisTemplate.opsForZSet().remove(key, userId);
                }
            }
        }
        cursor.close();
    }

    private Optional<MatchResult> findExactMatch(int userId, String key) {
        if (key == null) return Optional.empty();

        Set<String> candidates = redisTemplate.opsForZSet().range(key, 0, 0);
        if (candidates == null || candidates.isEmpty()) return Optional.empty();

        String match = candidates.iterator().next();
        if (match == null) return Optional.empty();

        redisTemplate.opsForZSet().remove(key, match);
        return Optional.of(MatchResult.builder()
                .userId1(userId)
                .userId2(Integer.parseInt(match))
                .topic(key.split(":")[1])
                .difficulty(key.split(":")[2])
                .build()
        );
    }

    private Optional<MatchResult> findSameDifficultyMatch(int userId, String difficulty) {
        if (difficulty == null) return Optional.empty();

        ScanOptions options = ScanOptions.scanOptions().match("queue:*:" + difficulty).count(100).build();
        Cursor<byte[]> cursor = redisTemplate.getConnectionFactory().getConnection().scan(options);
        Optional<MatchResult> result = Optional.empty();
        try {
            while (cursor.hasNext()) {
                String key = new String(cursor.next());
                result = findExactMatch(userId, key);
                if (result.isPresent()) break;
            }
        } finally {
            cursor.close();
        }
        return result;
    }

    private String getHigherDifficulty(String difficulty) {
        if (difficulty.equals("easy")) return "medium";
        if (difficulty.equals("medium")) return "hard";
        return null;
    }

    private String getLowerDifficulty(String difficulty) {
        if (difficulty.equals("medium")) return "easy";
        if (difficulty.equals("hard")) return "medium";
        return null;
    }

    private String buildKey(String topic, String difficulty) {
        if (topic == null || difficulty == null) {
            throw new IllegalArgumentException("topic and difficulty cannot be null");
        }
        return "queue:" + topic.trim().toLowerCase() + ":" + difficulty.trim().toLowerCase();
    }
}