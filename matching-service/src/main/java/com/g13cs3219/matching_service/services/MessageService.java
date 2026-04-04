package com.g13cs3219.matching_service.services;

import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import com.g13cs3219.matching_service.dto.responses.MatchResult;

import lombok.AllArgsConstructor;

@Service
@AllArgsConstructor
public class MessageService {

    private static final Logger log = LoggerFactory.getLogger(MessageService.class.getName());
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Send a timeout message to the user when they have been waiting for too long.
     *
     * @param userId The ID of the user to send the message to.
     */
    public void sendTimeoutMessage(String userId) {
        sendMessage(userId, "No match found");
    }

    /**
     * Send a match found message to both users when a match is found.
     *
     * @param match The match result containing the user IDs and question ID.
     */
    public void sendMatchFoundMessage(MatchResult match) {
        log.info("Sending match found message to users: {} and {}", match.getUserId1(), match.getUserId2());
        sendMatch(match.getUserId1() + "", match);
        sendMatch(match.getUserId2() + "", match);
    }

    /**
     * Send a match cancelled message to the user when they cancel their match request.
     *
     * @param userId The ID of the user to send the message to.
     */
    public void sendCancelMessage(String userId) {
        sendMessage(userId, "Match cancelled");
    }

    private void sendMessage(String userId, String message) {
        log.info("Sending message: " + message + " to user " + userId);
        messagingTemplate.convertAndSendToUser(
            userId,
            "/queue/match",
            message
        );
    }

    @Async
    private void sendMatch(String userId, MatchResult matchResult) {
        log.info("Sending match result to user " + userId);
        messagingTemplate.convertAndSendToUser(
            userId,
            "/queue/match",
            matchResult
        );
    }
}
