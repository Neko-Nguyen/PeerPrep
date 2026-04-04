import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Center, Select, Space, Stack, Text, TextInput } from '@mantine/core';
import { matchingApi } from '../../api/matching';
import { useAuth } from '../../context/ContextProvider';
import { Client } from '@stomp/stompjs';
import { questionApi } from '../../api/question';
import { useNavigate } from 'react-router-dom';

export default function MatchPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [isMatching, setIsMatching] = useState(false);
  const [timer, setTimer] = useState(0);
  const [err, setErr] = useState('');
  const clientRef = useRef(null);
  const navigateRef = useRef(navigate);

  useEffect(() => { navigateRef.current = navigate; }, [navigate]);

  useEffect(() => {
    if (!isMatching) return;
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isMatching]);

  if (loading) return <div>Loading dashboard…</div>;
  if (!user) return <div>No user data found.</div>;

  const connectAndWait = () => {
    return new Promise((resolve, reject) => {
      const matchingApiBaseUrl = import.meta.env.VITE_MATCHING_API_BASE_URL || "http://localhost:8082";

      const wsUrl = matchingApiBaseUrl
          .replace(/^http:\/\//, 'ws://')
          .replace(/^https:\/\//, 'wss://');

      const brokerURL = `${wsUrl}/ws/websocket?userId=${user.userId}`;
      console.log('[WS] Connecting to:', brokerURL);

      const stompClient = new Client({
        brokerURL,
        reconnectDelay: 0,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        debug: (str) => console.log('[STOMP]', str),
      });

      stompClient.onConnect = () => {
        console.log('[WS] Connected, subscribing...');
        stompClient.subscribe(`/user/queue/match`, (message) => {
          console.log('[WS] Raw message:', message.body);
          handleMatchMessage(message.body);
        });
        console.log('[WS] Subscribed to /user/queue/match');
        resolve();
      };

      stompClient.onStompError = (frame) => {
        console.error('[WS] STOMP error:', frame);
        reject(new Error('WebSocket connection failed: ' + frame.headers['message']));
      };

      stompClient.onWebSocketClose = (event) => {
        console.log('[WS] WebSocket closed:', event);
        if (event.code !== 1000) {
          reject(new Error('WebSocket closed unexpectedly: ' + event.reason));
        }
      };

      stompClient.activate();
      clientRef.current = stompClient;
    });
  };

  const handleMatch = async (e) => {
    e.preventDefault();
    setErr('');

    if (!topic || !difficulty) {
      setErr('Please select a topic and difficulty.');
      return;
    }

    try {
      setIsMatching(true);
      setTimer(30);
      await connectAndWait();
      await matchingApi.match({ userId: user.userId, topic, difficulty });
    } catch (error) {
      setErr(error?.message || 'Unable to start matching. Please try again.');
      setIsMatching(false);
      setTimer(0);
      disconnect();
    }
  };

  const fetchQuestion = async (topic, difficulty) => {
    try {
      const response = await questionApi.match({ topic, difficulty });
      return response.data.question;
    } catch (error) {
      console.error('Error fetching question:', error);
      return null;
    }
  };

  const startCollaboration = (userId1, userId2, questionId) => {
    const roomId = [userId1, userId2].sort().join('-') + '-' + questionId;
    const url = `/collaborate/${roomId}?questionId=${encodeURIComponent(questionId ?? "")}`;
    console.log('[WS] Navigating to:', url);
    navigateRef.current(url);
  };

  const handleMatchMessage = async (data) => {
    console.log('[WS] Received match message:', data);

    if (data === 'No match found') {
      setErr('No match found. Please try again later.');
      setIsMatching(false);
      setTimer(0);
      disconnect();
    } else if (data === 'Match cancelled') {
      setIsMatching((current) => {
        if (!current) {
          setErr('Match cancelled.');
          disconnect();
        }
        return current;
      });
    } else {
      try {
        const matchInfo = JSON.parse(data);
        console.log('[WS] Match info:', matchInfo);

        const question = await fetchQuestion(matchInfo.topic, matchInfo.difficulty);
        console.log('[WS] Question fetched:', question);

        if (question) {
          startCollaboration(matchInfo.userId1, matchInfo.userId2, question.questionId);
        } else {
          setErr('Failed to fetch question for the match.');
        }
      } catch (e) {
        console.error('[WS] Error processing match:', e);
        setErr('Unexpected error processing match result.');
      }
      setIsMatching(false);
      setTimer(0);
      disconnect();
    }
  };

  const handleCancel = async () => {
    try {
      await matchingApi.leave({ userId: user.userId, topic, difficulty });
      setIsMatching(false);
      setTimer(0);
      disconnect();
    } catch (error) {
      setErr('Failed to cancel. Please try again.');
    }
  };

  const handleLooseMatch = async () => {
    try {
      await matchingApi.loosematch({ userId: user.userId, topic, difficulty });
      setTimer(15);
    } catch (error) {
      setErr('Failed to switch to loose match.');
    }
  };

  const disconnect = () => {
    if (clientRef.current) {
      clientRef.current.deactivate();
      clientRef.current = null;
    }
  };

  return (
      <div>
        <Center style={{ minHeight: "80vh" }}>
          <Card withBorder p="xl" style={{ width: "90%", maxWidth: 600 }} shadow="xl">
            <Stack p="xl">
              {isMatching
                  ? <div>
                    <Text size="lg" fw={500}>Finding a match... {timer}s</Text>
                    <div className="button-container">
                      <Button fullWidth variant="outline" color="red" size="md" onClick={handleCancel}>
                        Cancel Match
                      </Button>
                    </div>
                    <Space h="md" />
                    <Button fullWidth variant="subtle" color="gray" size="sm" onClick={handleLooseMatch}>
                      Loose Match
                    </Button>
                    {err && (<><Space h="sm" /><Text c="red" size="sm">{err}</Text></>)}
                  </div>
                  : <div className="form-container">
                    <form onSubmit={handleMatch}>
                      <TextInput
                          placeholder="Arrays"
                          label="Topic"
                          size="md"
                          value={topic}
                          onChange={(event) => setTopic(event.currentTarget.value)}
                      />
                      <Space h="lg" />
                      <Select
                          label="Difficulty"
                          placeholder="Pick one"
                          value={difficulty}
                          onChange={setDifficulty}
                          data={[
                            { value: 'easy', label: 'Easy' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'hard', label: 'Hard' },
                          ]}
                      />
                      {err && (<><Space h="sm" /><Text c="red" size="sm">{err}</Text></>)}
                      <Space h="xl" />
                      <div className="button-container">
                        <Button fullWidth variant="filled" size="md" type="submit" className="button">
                          Match
                        </Button>
                      </div>
                    </form>
                  </div>
              }
            </Stack>
          </Card>
        </Center>
      </div>
  );
}