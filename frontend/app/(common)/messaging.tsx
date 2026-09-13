import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from '../../components/ui/Toast';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import webSocketService from '@/services/websocketService';
import ProfileImage from '../../components/ProfileImage';
import apiClient, { getCurrentUserId } from '@/services/apiClient';

const PRIMARY = '#BC001F';
const SECONDARY = '#EA2F14';
const BG = '#f8f9fa';

const MessagingScreen = () => {
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top + (Platform.OS === 'android' ? 8 : 4), 32);
  const bottomPadding = Math.max(insets.bottom, 10);

  const params = useLocalSearchParams();
  const router = useRouter();
  const rideId = params.rideId as string;
  const [userId, setUserId] = useState<string | null>(params.userId as string || null);
  const userRole = (params.userRole as string) || 'passenger'; // 'driver' or 'passenger'
  const driverName = params.driverName as string || 'Driver';
  const passengerName = params.passengerName as string || 'Passenger';
  const driverPhone = (params.driverPhone as string) || '';
  const passengerPhone = (params.passengerPhone as string) || '';
  
  // Fix name display logic - show the other person's name, not "You"
  const defaultOtherUserName = userRole === 'driver' ? 
    (passengerName === 'You' ? 'Passenger' : passengerName) : 
    (driverName === 'You' ? 'Driver' : driverName);
  const defaultOtherUserPhone = userRole === 'driver' ? passengerPhone : driverPhone;
  const defaultOtherRole = userRole === 'driver' ? 'Passenger' : 'Driver';

  const [contactName, setContactName] = useState<string>(defaultOtherUserName);
  const [contactPhone, setContactPhone] = useState<string>(defaultOtherUserPhone);
  const [contactRole, setContactRole] = useState<string>(defaultOtherRole);
  
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

  const showToast = (message: string, type: 'info' | 'success' | 'error') => setToast({ visible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, visible: false }));

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Scroll to bottom when keyboard appears
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setIsKeyboardVisible(true);
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 120);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardVisible(false);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // --- Ensure userId is available ---
  useEffect(() => {
    if (!userId) {
      getCurrentUserId().then(id => setUserId(id));
    }
  }, [userId]);

  // --- Fetch Ride Details for Contact Name and Phone Number ---
  useEffect(() => {
    if (!rideId) return;
    let isMounted = true;

    async function fetchRideInfo() {
      try {
        console.log('Messaging: Fetching ride info for rideId:', rideId);
        const response = await apiClient.get(`/rides/${rideId}`);
        if (!isMounted) return;
        const ride = response.data?.data || response.data;
        if (ride) {
          const activeUserId = userId || (await getCurrentUserId());
          const isDriver = userRole === 'driver' || (ride.driverId && String(ride.driverId) === String(activeUserId));
          
          if (isDriver) {
            const pName = ride.passenger ? `${ride.passenger.firstName || ''} ${ride.passenger.lastName || ''}`.trim() : '';
            const pPhone = ride.passenger?.mobile || passengerPhone;
            if (pName && pName !== 'You') setContactName(pName);
            if (pPhone) setContactPhone(pPhone);
            setContactRole('Passenger');
          } else {
            const dName = ride.driver ? `${ride.driver.firstName || ''} ${ride.driver.lastName || ''}`.trim() : '';
            const dPhone = ride.driver?.mobile || driverPhone;
            if (dName && dName !== 'You') setContactName(dName);
            if (dPhone) setContactPhone(dPhone);
            setContactRole('Driver');
          }
        }
      } catch (e: any) {
        console.log('Messaging: Could not fetch ride details for header:', e?.message || e);
      }
    }

    fetchRideInfo();
    return () => {
      isMounted = false;
    };
  }, [rideId, userId, userRole, driverPhone, passengerPhone]);

  // --- WebSocket Setup ---
  useEffect(() => {
    if (!rideId) return;
    
    let isMounted = true;
    setLoading(true);
    setError(null);
    setOtherTyping(false);
    setIsConnected(false);

    async function connectSocket() {
      try {
        const activeUserId = userId || (await getCurrentUserId());
        if (activeUserId && !userId) {
          setUserId(activeUserId);
        }
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
  const handleCall = async () => {
    let phone = (contactPhone || defaultOtherUserPhone || '').trim();

    // If phone is missing, try a quick on-demand fetch
    if (!phone && rideId) {
      try {
        const response = await apiClient.get(`/rides/${rideId}`);
        const ride = response.data?.data || response.data;
        if (ride) {
          const isDriver = contactRole === 'Passenger';
          phone = (isDriver ? ride.passenger?.mobile : ride.driver?.mobile) || '';
          if (phone) setContactPhone(phone);
        }
      } catch (err: any) {
        console.warn('Messaging: On-demand phone fetch failed:', err?.message || err);
      }
    }

    if (!phone) {
      Alert.alert(
        'Phone Number Unavailable',
        `No contact number found for the ${contactRole.toLowerCase()}. Please continue communicating via in-app chat.`,
        [{ text: 'OK' }]
      );
      return;
    }

    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const url = `tel:${cleanPhone}`;

    try {
      await Linking.openURL(url);
    } catch (err) {
      console.error('Failed to open dialer for:', cleanPhone, err);
      Alert.alert('Unable to Call', `Could not open the dialer for ${cleanPhone}. Please dial manually.`);
    }
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
    <View style={[styles.header, { paddingTop: topPadding }]}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <MaterialIcons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>
      <View style={styles.headerInfo}>
        <Text style={styles.headerName}>{contactName}</Text>
        <Text style={styles.headerRole}>{contactRole}</Text>
        <View style={styles.connectionStatus}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? '#4CAF50' : '#f44336' }]} />
          <Text style={[styles.statusText, { color: isConnected ? '#4CAF50' : '#f44336' }]}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.callButton} 
        onPress={handleCall}
        activeOpacity={0.7}
      >
        <MaterialIcons name="phone" size={22} color={PRIMARY} />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      style={styles.container}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      {renderHeader()}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesList}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
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
      <View style={[styles.inputContainer, { paddingBottom: isKeyboardVisible ? 12 : bottomPadding }]}>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={text => {
            setMessage(text);
            setTyping(true);
          }}
          placeholder="Type a message..."
          editable={!sending && isConnected}
          onFocus={() => {
            setTyping(true);
            setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
          }}
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
      
      {/* Toast */}
      {toast.visible && (
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />
      )}
      
      {error && <Text style={styles.errorText}>{error}</Text>}
    </KeyboardAvoidingView>
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
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDE8EA',
    justifyContent: 'center',
    alignItems: 'center',
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
