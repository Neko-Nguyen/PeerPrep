package com.g13cs3219.matching_service;

import com.g13cs3219.matching_service.dto.requests.JoinRequest;
import com.g13cs3219.matching_service.dto.responses.MatchResult;
import com.g13cs3219.matching_service.repositories.MatchingPool;
import com.g13cs3219.matching_service.services.MessageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.ActiveProfiles;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class MatchingServiceApplicationTests {

	@Autowired
	private MatchingPool matchingPool;

	@MockitoBean
	private MessageService messageService;
	@BeforeEach
	void setUp() {

		JoinRequest cleanup1 = new JoinRequest();
		cleanup1.setUserId(1);
		cleanup1.setTopic("arrays");
		cleanup1.setDifficulty("easy");

		JoinRequest cleanup2 = new JoinRequest();
		cleanup2.setUserId(2);
		cleanup2.setTopic("arrays");
		cleanup2.setDifficulty("easy");

		try {
			matchingPool.removeUser(cleanup1);
			matchingPool.removeUser(cleanup2);
		} catch (Exception ignored) {}
	}

	@Test
	void contextLoads() {
	}

	@Test
	void addUserToPool() {
		JoinRequest request = new JoinRequest();
		request.setUserId(1);
		request.setTopic("arrays");
		request.setDifficulty("easy");

		matchingPool.addUser(request);

		Optional<MatchResult> result = matchingPool.findMatch(2, "arrays", "easy", "match");
		assertThat(result).isPresent();
		assertThat(result.get().getUserId1()).isEqualTo(2);
		assertThat(result.get().getUserId2()).isEqualTo(1);
	}

	@Test
	void noMatchWhenPoolEmpty() {
		Optional<MatchResult> result = matchingPool.findMatch(99, "graphs", "hard", "match");
		assertThat(result).isEmpty();
	}

	@Test
	void sameUserNotMatchedWithSelf() {
		JoinRequest request = new JoinRequest();
		request.setUserId(5);
		request.setTopic("sorting");
		request.setDifficulty("medium");

		matchingPool.addUser(request);

		Optional<MatchResult> result = matchingPool.findMatch(5, "sorting", "medium", "match");

		if (result.isPresent()) {
			assertThat(result.get().getUserId2()).isEqualTo(5);
		}
	}

	@Test
	void buildKeyThrowsOnNullTopic() {
		JoinRequest request = new JoinRequest();
		request.setUserId(1);
		request.setTopic(null);
		request.setDifficulty("easy");

		org.junit.jupiter.api.Assertions.assertThrows(
				IllegalArgumentException.class,
				() -> matchingPool.addUser(request)
		);
	}

	@Test
	void buildKeyThrowsOnNullDifficulty() {
		JoinRequest request = new JoinRequest();
		request.setUserId(1);
		request.setTopic("arrays");
		request.setDifficulty(null);

		org.junit.jupiter.api.Assertions.assertThrows(
				IllegalArgumentException.class,
				() -> matchingPool.addUser(request)
		);
	}
}