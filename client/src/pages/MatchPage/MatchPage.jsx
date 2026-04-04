import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Center, Select, Space, Stack, Text, TextInput } from '@mantine/core';
import { matchingApi } from '../../api/matching';
import { useAuth } from '../../context/ContextProvider';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { questionApi } from '../../api/question';
import { useNavigate } from 'react-router-dom';

export default function MatchPage() {

  const { user, loading } = useAuth();

  const navigate = useNavigate();
  
  if (loading) return <div>Loading dashboard…</div>;
  if (!user) return <div>No user data found.</div>;

  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [isMatching, setIsMatching] = useState(false);
  const [timer, setTimer] = useState(0);
  const [err, setErr] = useState('');
  
  const clientRef = useRef(null);

  useEffect(() => {
    if (!isMatching) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isMatching]);

  const handleMatch = async (e) => {
    e.preventDefault();
    setErr('');
    
    try {
      connect();
      await matchingApi.match({ 
        userId: user.userId, 
        topic: topic, 
        difficulty: difficulty 
      });
      
      setIsMatching(true);
      setTimer(30);
    } catch (error) {
      setErr(error?.message || 'Unable to start matching. Please try again.');
    }
  };

  const connect = () => {
    const matchingApiBaseUrl = import.meta.env.VITE_MATCHING_API_BASE_URL || "http://localhost:8082";
    const wsUrl = new URL(matchingApiBaseUrl);
    wsUrl.pathname = '/ws';
    wsUrl.searchParams.set('userId', user.userId);

    const socket = new SockJS(wsUrl.toString());
    const stompClient = new Client({
      webSocketFactory: () => socket,
      debug: (str) => {
        console.log(str);
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    stompClient.onConnect = (frame) => {
      // console.log('Connected: ' + frame);

      stompClient.subscribe(`/user/queue/match`, (message) => {
        handleMatchMessage(message.body);
      });
    };

    stompClient.onStompError = (frame) => {
      console.log('Broker reported error: ' + frame.headers['message']);
      console.log('Additional details: ' + frame.body);
    };
    
    stompClient.activate();
    clientRef.current = stompClient;
  };

  const fetchQuestion = async (topic, difficulty) => {
    try {
      const response = await questionApi.match({ topic: topic, difficulty: difficulty });
      return response.data.question;
    } catch (error) {
      console.error('Error fetching question:', error);
      return null;
    }  
  };

  const startCollaboration = (userId1, userId2, questionId) => {
    const roomId = [userId1, userId2].sort().join('-') + '-' + questionId;
    navigate(`/collaborate/${roomId}?questionId=${encodeURIComponent(questionId ?? "")}`);
  };

  const handleMatchMessage = async (data) => {
    if (data === 'No match found') {
      setErr('No match found. Please try again later.');
    } else if (data === 'Match cancelled') {
      setErr('Match cancelled.');
    } else {
      const matchInfo = JSON.parse(data);
      console.log('Received match info:', matchInfo);
      
      const question = await fetchQuestion(
        matchInfo.topic,
        matchInfo.difficulty
      );
      
      if (question) {
        startCollaboration(
          matchInfo.userId1, 
          matchInfo.userId2, 
          question.questionId
        );
      } else {
        setErr('Failed to fetch question for the match.');
      }
    }
    setIsMatching(false);
    disconnect();
    console.log('Raw message:', data);
  };

  const handleCancel = () => {
    matchingApi.leave({ 
      userId: user.userId,
      topic: topic,
      difficulty: difficulty
    });
  };

  const handleLooseMatch = () => {
    matchingApi.loosematch({ 
      userId: user.userId,
      topic: topic,
      difficulty: difficulty
    });
  };

  const disconnect = () => {
    if (clientRef.current) {
      clientRef.current.deactivate();
    }
  };

  return (
    <div>
      <Center style={{ minHeight: "80vh" }}>
        <Card
          withBorder
          p="xl"
          style={{ width: "90%", maxWidth: 600 }}
          shadow="xl"
        >
          <Stack p="xl">
            { isMatching 
              ? <div>
                  <Text size="lg" fw={500}>
                    Finding a match... {timer}s
                  </Text>
                  <div className="button-container">
                    <Button fullWidth variant="outline" color="red" size="md" onClick={handleCancel}>
                      Cancel Match
                    </Button>
                  </div>

                  <Space h="md"/>

                  <Button fullWidth variant="subtle" color="gray" size="sm" onClick={handleLooseMatch}>
                    Loose Match
                  </Button>
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

                  {err && (
                    <>
                      <Space h="sm" />
                      <Text c="red" size="sm">
                        {err}
                      </Text>
                    </>
                  )}

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
};
