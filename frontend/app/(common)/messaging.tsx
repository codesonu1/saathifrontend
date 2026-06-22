"use client"

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import webSocketService from '../utils/websocketService';
import ProfileImage from '../../components/ProfileImage';
import { getCurrentUserId } from '../utils/apiClient';

const PRIMARY = '#075B5E';
const SECONDARY = '#EA2F14';
const BG = '#f8f9fa';

const MessagingScreen = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const rideId = params.rideId as string;
  const [userId, setUserId] = useState<string | null>(params.userId as string || null);
  const userRole = params.userRole as string; // 'driver' or 'passenger'
  const driverName = params.driverName as string || 'Driver';
  const passengerName = params.passengerName as string || 'Passenger';
  const driverPhone = params.driverPhone as string || '';
  const passengerPhone = params.passengerPhone as string || '';
  
  // Fix name display logic - show the other person's name, not "You"
  const otherUserName = userRole === 'driver' ? 
    (passengerName === 'You' ? 'Passenger' : passengerName) : 
    (driverName === 'You' ? 'Driver' : driverName);
  const otherUserPhone = userRole === 'driver' ? passengerPhone : driverPhone;
  
  const [messages, setMessages] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    message: '',
    type: 'info',
  });
  const [showCallModal, setShowCallModal] = useState(false);
  
  const showToast = (message: string, type: 'info' | 'success' | 'error') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  // --- Ensure userId is available ---
  useEffect(() => {
    if (!userId) {
      getCurrentUserId().then(id => setUserId(id));
    }
  }, [userId]);

  // --- WebSocket Setup ---
  useEffect(() => {
    if (!rideId || !userId) return;
    
    let isMounted = true;
    setLoading(true);
    setError(null);
    setOtherTyping(false);
    setIsConnected(false);

    async function connectSocket() {
      try {
        console.log('Messaging: Checking ride WebSocket connection for rideId:', rideId);
        
        // Check if already connected to the same ride
        const existingSocket = webSocketService.getSocket('ride');
        if (existingSocket && existingSocket.connected) {
          console.log('Messaging: WebSocket already connected, using existing connection');
          setIsConnected(true);
        } else {
          console.log('Messaging: Connecting to ride WebSocket for rideId:', rideId);
          await webSocketService.connect(rideId, 'ride');
        }
        
        const socket = webSocketService.getSocket('ride');
        
        if (!socket) {
          throw new Error('Failed to get socket instance');
        }

        setIsConnected(true);
        console.log('Successfully connected to ride WebSocket');

        // Load all messages
        socket.emit('getAllMessages', (response: any) => {
          if (!isMounted) return;
          console.log('getAllMessages response:', response);
          
          if (response?.code === 200 && Array.isArray(response.data)) {
            setMessages(response.data);
            setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 100);
          } else {
            console.error('Failed to load messages:', response);
            showToast('Failed to load messages', 'error');
          }
          setLoading(false);
        });

        // Listen for new messages
        socket.on('messageCreated', (msg: any) => {
          console.log('New message received:', msg);
          if (!isMounted) return;
          // Handle both direct message and wrapped response
          const messageData = msg?.data || msg;
          setMessages(prev => [...prev, messageData]);
          setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        });

        // Listen for message deleted
        socket.on('messageDeleted', (msg: any) => {
          console.log('Message deleted:', msg);
          if (!isMounted) return;
          const messageData = msg?.data || msg;
          setMessages(prev => prev.filter(m => m._id !== messageData._id));
        });

        // Listen for typing
        socket.on('isTyping', (data: any) => {
          console.log('Typing indicator:', data);
          if (!isMounted) return;
          // Handle both direct data and wrapped response
          const typingData = data?.data || data;
          if (typingData?.userId !== userId) {
            setOtherTyping(true);
            setTimeout(() => setOtherTyping(false), 3000); // auto-hide after 3s
          }
        });

        // Listen for connection status
        socket.on('connect', () => {
          console.log('WebSocket connected');
          setIsConnected(true);
        });

        socket.on('disconnect', () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
        });

        socket.on('error', (err: any) => {
          console.error('WebSocket error:', err);
          showToast('WebSocket error: ' + (err?.message || 'Unknown error'), 'error');
        });

      } catch (err: any) {
        console.error('WebSocket connection failed:', err);
        if (isMounted) {
          showToast('WebSocket connection failed: ' + (err?.message || 'Unknown error'), 'error');
          setLoading(false);
          setIsConnected(false);
        }
      }
    }

    connectSocket();

    return () => {
      isMounted = false;
      console.log('Messaging screen unmounting - NOT disconnecting WebSocket (ride tracker needs it)');
      // Don't disconnect the WebSocket here since the ride tracker needs to maintain the connection
      // The ride tracker will handle the WebSocket lifecycle
    };
  }, [rideId, userId]);

  // --- Typing indicator ---
  useEffect(() => {
    if (!typing || !userId || !isConnected) return;
    
    const socket = webSocketService.getSocket('ride');
    if (!socket) return;

    socket.emit('isTyping');
    
    const timeout = setTimeout(() => {
      setTyping(false);
    }, 2000);
    
    return () => clearTimeout(timeout);
  }, [typing, userId, isConnected]);

  // --- Send message ---
  const handleSend = async () => {
    if (!message.trim() || sending || !userId || !isConnected) {
      if (!isConnected) {
        showToast('Not connected to chat', 'error');
      }
      return;
    }
    
    const messageToSend = message.trim();
    setSending(true);
    
    // Clear input immediately for better UX
    setMessage('');
    setTyping(false);
    
    try {
      const socket = webSocketService.getSocket('ride');
      if (socket) {
        console.log('Sending message:', messageToSend);
        socket.emit('sendMessage', messageToSend, (response: any) => {
          console.log('Send message response:', response);
          if (response?.code === 201) {
            // Message sent successfully - input already cleared
            console.log('Message sent successfully, input cleared');
          } else {
            // If failed, restore the message to input field
            setMessage(messageToSend);
            showToast('Failed to send message: ' + (response?.message || 'Unknown error'), 'error');
          }
          setSending(false);
        });
      } else {
        // If no socket, restore the message to input field
        setMessage(messageToSend);
        showToast('WebSocket not connected', 'error');
        setSending(false);
      }
    } catch (err: any) {
      // If error, restore the message to input field
      setMessage(messageToSend);
      console.error('Failed to send message:', err);
      showToast('Failed to send message: ' + (err?.message || 'Unknown error'), 'error');
      setSending(false);
    }
  };

  // --- Delete message ---
  const handleDelete = (msg: any) => {
    if (!userId || !isConnected) return;
    
    // Check if user can delete this message
    const senderId = typeof msg.senderId === 'object' ? msg.senderId._id : msg.senderId;
    if (senderId !== userId) {
      showToast('You can only delete your own messages', 'error');
      return;
    }
    
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', 
        style: 'destructive', 
        onPress: () => {
          const socket = webSocketService.getSocket('ride');
          if (socket) {
            console.log('Deleting message:', msg._id);
            socket.emit('deleteMessage', { messageId: msg._id }, (response: any) => {
              console.log('Delete message response:', response);
              if (response?.code === 200) {
                // Message will be removed via the messageDeleted event
                showToast('Message deleted', 'success');
              } else {
                showToast('Failed to delete message: ' + (response?.message || 'Unknown error'), 'error');
              }
            });
          } else {
            showToast('WebSocket not connected', 'error');
          }
        }
      }
    ]);
  };

  // --- Phone call functionality ---
  const handleCall = () => {
    if (!otherUserPhone) {
      showToast('Phone number not available', 'error');
      return;
    }
    setShowCallModal(true);
  };

  const confirmCall = () => {
    setShowCallModal(false);
    Linking.openURL(`tel:${otherUserPhone}`);
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      console.error('Error formatting time:', error, 'timestamp:', timestamp);
      return 'Invalid Date';
    }
  };

  const renderMessage = (msg: any, index: number) => {
    // Handle senderId which can be either a string or an object
    const senderId = typeof msg.senderId === 'object' ? msg.senderId._id : msg.senderId;
    const isOwnMessage = senderId === userId;
    
    return (
      <TouchableOpacity
        key={msg._id || `msg-${index}`}
        onLongPress={() => isOwnMessage && handleDelete(msg)}
        activeOpacity={isOwnMessage ? 0.7 : 1}
        style={[styles.messageContainer, isOwnMessage ? styles.ownMessage : styles.otherMessage]}
      >
        <View style={[styles.messageBubble, isOwnMessage ? styles.ownBubble : styles.otherBubble]}>
          <Text style={[styles.messageText, isOwnMessage ? styles.ownMessageText : styles.otherMessageText]}>{msg.content}</Text>
          <Text style={[styles.messageTime, isOwnMessage ? styles.ownMessageTime : styles.otherMessageTime]}>{formatTime(msg.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // --- Header ---
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <MaterialIcons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>
      <View style={styles.headerInfo}>
        <Text style={styles.headerName}>{otherUserName}</Text>
        <Text style={styles.headerRole}>{userRole === 'driver' ? 'Passenger' : 'Driver'}</Text>
        <View style={styles.connectionStatus}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? '#4CAF50' : '#f44336' }]} />
          <Text style={[styles.statusText, { color: isConnected ? '#4CAF50' : '#f44336' }]}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
      </View>
      <TouchableOpacity 
        style={[styles.callButton, !otherUserPhone && styles.callButtonDisabled]} 
        onPress={handleCall}
        disabled={!otherUserPhone}
      >
        <MaterialIcons name="phone" size={24} color={otherUserPhone ? PRIMARY : '#ccc'} />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      {renderHeader()}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesList}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialIcons name="chat-bubble-outline" size={48} color="#ccc" />
              <Text style={styles.emptyStateTitle}>No messages yet</Text>
              <Text style={styles.emptyStateSubtitle}>Start the conversation!</Text>
            </View>
          )}
          {messages.map((msg, index) => renderMessage(msg, index))}
          {otherTyping && (
            <View style={styles.typingContainer}>
              <View style={styles.typingBubble}>
                <Text style={styles.typingText}>Typing...</Text>
              </View>
            </View>
          )}
        </ScrollView>
                <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={message}
            onChangeText={text => {
              setMessage(text);
              setTyping(true);
            }}
            placeholder="Type a message..."
            editable={!sending && isConnected}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline={false}
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, message.trim() && isConnected ? styles.sendButtonActive : styles.sendButtonInactive]}
            onPress={handleSend}
            disabled={sending || !message.trim() || !isConnected}
          >
            <MaterialIcons name="send" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      
      {/* Toast */}
      {toast.visible && (
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />
      )}
      
      {/* Call Confirmation Modal */}
      <ConfirmationModal
        visible={showCallModal}
        title="Make a Call"
        message={`Call ${otherUserName}?`}
        confirmText="Call"
        cancelText="Cancel"
        onConfirm={confirmCall}
        onCancel={() => setShowCallModal(false)}
      />
      
      {error && <Text style={styles.errorText}>{error}</Text>}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  keyboardAvoidingView: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    marginTop: 28,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 8,
  },
  headerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  headerRole: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '500',
  },
  callButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  callButtonDisabled: {
    backgroundColor: '#f5f5f5',
  },
  messagesList: {
    flex: 1,
    backgroundColor: BG,
    marginBottom: 0,
  },
  messageContainer: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  ownMessage: {
    justifyContent: 'flex-end',
  },
  otherMessage: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  ownBubble: {
    backgroundColor: PRIMARY,
    alignSelf: 'flex-end',
  },
  otherBubble: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e9ecef',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  otherMessageTime: {
    color: '#999',
  },
  typingContainer: {
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  typingBubble: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e9ecef',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  typingText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    maxHeight: 100,
    backgroundColor: '#fff',
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonActive: {
    backgroundColor: PRIMARY,
  },
  sendButtonInactive: {
    backgroundColor: '#ccc',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginTop: 10,
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 24,
  },
});

export default MessagingScreen;
