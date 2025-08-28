import { useState, useEffect, useRef } from "react";
import { Message } from "../types/chat";

interface ChatInterfaceProps {
  sessionId: string;
  userRole: "venter" | "listener";
  messages: Message[];
  onSendMessage: (content: string) => void;
  onEndChat: () => void;
  onReport: () => void;
  connectionStatus:
    | "connected"
    | "connecting"
    | "disconnected"
    | "reconnecting";
  otherUserConnected: boolean;
  otherUserName?: string;
  currentUserName?: string;
  currentUserPhoto?: File | null;
  otherUserPhoto?: File | null;
  isOtherUserTyping?: boolean;
  onTypingChange?: (isTyping: boolean) => void;
  spamWarning?: string | null;
  messageBlocked?: {
    message: string;
    timeRemaining?: number;
  } | null;
  onDismissSpamWarning?: () => void;
  onDismissMessageBlocked?: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  sessionId,
  userRole,
  messages,
  onSendMessage,
  onEndChat,
  onReport,
  connectionStatus,
  otherUserConnected,
  otherUserName,
  currentUserName,
  currentUserPhoto,
  otherUserPhoto,
  isOtherUserTyping = false,
  onTypingChange,
  spamWarning,
  messageBlocked,
  onDismissSpamWarning,
  onDismissMessageBlocked,
}) => {
  const [messageInput, setMessageInput] = useState("");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousMessagesLength = useRef(messages.length);
  const [hasNewMessageFromOther, setHasNewMessageFromOther] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [blockCountdown, setBlockCountdown] = useState<number>(0);

  // Auto-scroll to bottom only when:
  // 1. A new message arrives from the other user AND
  // 2. The user was already at the bottom before the new message
  useEffect(() => {
    const hasNewMessage = messages.length > previousMessagesLength.current;
    const lastMessage = messages[messages.length - 1];
    const isNewMessageFromOther =
      lastMessage && lastMessage.sender !== userRole;

    // Track when other user sends a new message
    if (hasNewMessage && isNewMessageFromOther) {
      setHasNewMessageFromOther(true);
      // Only increment unread count if user is not at bottom
      if (!isAtBottom) {
        setUnreadCount((prev) => prev + 1);
      }
    }

    if (
      hasNewMessage &&
      isNewMessageFromOther &&
      isAtBottom &&
      messagesEndRef.current
    ) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }

    // Always scroll to bottom for user's own messages
    if (
      hasNewMessage &&
      lastMessage &&
      lastMessage.sender === userRole &&
      messagesEndRef.current
    ) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }

    previousMessagesLength.current = messages.length;
  }, [messages, userRole, isAtBottom]);

  // Auto-scroll when typing indicator appears/disappears if user is at bottom
  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      // Small delay to ensure DOM has updated with typing indicator
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
      }, 50);
    }
  }, [isOtherUserTyping, isAtBottom]);

  // Handle scroll events to detect if user is at bottom and show/hide scroll to bottom button
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px threshold

      setIsAtBottom(atBottom);

      // Show scroll to bottom button if:
      // 1. User is not at bottom AND
      // 2. There are messages
      setShowScrollToBottom(!atBottom && messages.length > 0);

      // Reset the flag and unread count when user scrolls to bottom
      if (atBottom) {
        setHasNewMessageFromOther(false);
        setUnreadCount(0);
      }
    };

    container.addEventListener("scroll", handleScroll);

    // Initial check
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [messages.length, hasNewMessageFromOther]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Handle spam warning auto-dismiss (consistent with main app notifications)
  useEffect(() => {
    if (spamWarning && onDismissSpamWarning) {
      const timer = setTimeout(() => {
        onDismissSpamWarning();
      }, 5000); // Auto-dismiss after 5 seconds (same as main app)
      return () => clearTimeout(timer);
    }
  }, [spamWarning, onDismissSpamWarning]);

  // Message blocked auto-dismiss is handled by parent component (App.tsx) based on actual timeRemaining

  // Handle message block countdown
  useEffect(() => {
    if (messageBlocked?.timeRemaining) {
      setBlockCountdown(Math.ceil(messageBlocked.timeRemaining / 1000));
      
      const interval = setInterval(() => {
        setBlockCountdown((prev) => {
          if (prev <= 1) {
            // Message block will be cleared by parent component
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [messageBlocked]);



  const handleSendMessage = () => {
    const trimmedMessage = messageInput.trim();
    if (trimmedMessage && connectionStatus === "connected") {
      onSendMessage(trimmedMessage);
      setMessageInput("");

      // Clear typing status when message is sent
      if (onTypingChange) {
        onTypingChange(false);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessageInput(value);

    const isCurrentlyTyping = value.trim().length > 0;

    // Handle typing status for other user
    if (onTypingChange) {
      if (isCurrentlyTyping) {
        // User is typing - send typing status
        onTypingChange(true);

        // Clear existing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        // Set timeout to stop typing status after 2 seconds of inactivity
        typingTimeoutRef.current = setTimeout(() => {
          onTypingChange(false);
        }, 2000);
      } else {
        // User cleared input - stop typing immediately
        onTypingChange(false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
      }
    }
  };

  const scrollToBottom = () => {
    if (
      messagesEndRef.current &&
      typeof messagesEndRef.current.scrollIntoView === "function"
    ) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      // Reset the flag and unread count when user manually scrolls to bottom
      setHasNewMessageFromOther(false);
      setUnreadCount(0);
    }
  };

  const getUserDisplayName = (message: Message): string => {
    if (message.sender === userRole) {
      return "You";
    }
    // Show the sender's name from the message data
    return message.senderName || otherUserName || "Anonymous";
  };

  const getConnectionStatusMessage = (): string => {
    if (connectionStatus === "connecting") return "Connecting...";
    if (connectionStatus === "reconnecting") return "Reconnecting...";
    if (connectionStatus === "disconnected") return "Connection lost";
    if (!otherUserConnected) return "Waiting for other user...";
    return "Connected";
  };

  const getConnectionStatusColor = (): string => {
    if (connectionStatus === "connected" && otherUserConnected)
      return "text-green-600";
    if (connectionStatus === "disconnected") return "text-red-600";
    return "text-yellow-600";
  };

  return (
    <div
      className="chat-interface h-screen bg-sage flex flex-col relative"
      style={{
        backgroundImage: "url(/assets/leaf-bg.webp)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "scroll",
      }}
    >
      {/* Background overlay for better readability */}
      <div className="absolute inset-0 bg-sage bg-opacity-20 pointer-events-none"></div>

      {/* Header */}
      <header className="bg-white bg-opacity-80 backdrop-blur-sm border-b border-gray-border px-6 py-4 flex-shrink-0 relative z-10">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {/* Logo and Title */}
          <div className="flex items-center">
            <img
              src="/assets/logo.webp"
              alt="StrangEars Logo"
              className="h-8 w-auto mr-2"
            />
            <div>
              <h1 className="font-prata text-xl text-slate-dark">StrangEars</h1>
              <p className="font-inter text-sm text-slate-medium">
                Session: {sessionId.substring(0, 8)}...
              </p>
            </div>
          </div>

          {/* Connection Status */}
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p
                className={`font-inter text-sm font-medium ${getConnectionStatusColor()}`}
              >
                {getConnectionStatusMessage()}
              </p>
              <p className="font-inter text-xs text-slate-medium">
                You are:{" "}
                {currentUserName ||
                  (userRole === "venter" ? "Stranger 1" : "Stranger 2")}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              {/* Report Button */}
              <button
                onClick={onReport}
                className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg font-inter font-medium text-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                aria-label="Report inappropriate behavior"
                title="Report inappropriate behavior"
              >
                Report
              </button>

              {/* End Chat Button */}
              <button
                onClick={onEndChat}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-inter font-medium text-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-label="End chat session"
              >
                End Chat
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Spam Protection Notifications */}
      {spamWarning && (
        <div className="fixed top-4 right-4 z-50 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded shadow-lg max-w-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-inter">{spamWarning}</span>
            <button
              onClick={onDismissSpamWarning}
              className="ml-4 text-yellow-500 hover:text-yellow-700 transition-colors"
              aria-label="Close warning message"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {messageBlocked && (
        <div className={`fixed right-4 z-50 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg max-w-md ${spamWarning ? 'top-20' : 'top-4'}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-inter">
              {messageBlocked.message}
              {blockCountdown > 0 && (
                <span className="ml-2 font-medium">
                  ({blockCountdown}s remaining)
                </span>
              )}
            </span>
            <button
              onClick={onDismissMessageBlocked}
              className="ml-4 text-red-500 hover:text-red-700 transition-colors"
              aria-label="Close blocked message notification"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <main className="flex-1 overflow-hidden flex flex-col relative z-10">
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-6 py-4 scroll-smooth"
          style={{
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
          }}
        >
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Welcome Message */}
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="bg-white bg-opacity-60 rounded-lg p-6 backdrop-blur-sm">
                  <h2 className="font-prata text-lg text-slate-dark mb-2">
                    Welcome to your anonymous chat
                  </h2>
                  <p className="font-young-serif text-slate-medium">
                    {userRole === "venter"
                      ? "Feel free to share what's on your mind. Your listener is here to support you."
                      : "Thank you for being here to listen. Let them know you're ready to hear what they have to say."}
                  </p>
                  <p className="font-ysabeau text-sm text-slate-medium mt-3 italic">
                    Remember: Stay anonymous and be respectful. 💚
                  </p>
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((message) => {
              const isOwnMessage = message.sender === userRole;
              const userPhoto = isOwnMessage
                ? currentUserPhoto
                : otherUserPhoto;

              return (
                <div
                  key={message.id}
                  className={`flex w-full ${
                    isOwnMessage ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="flex items-start gap-3 max-w-[75%] min-w-0">
                    {/* Profile Picture - Always on the left */}
                    <div className="flex-shrink-0">
                      {userPhoto ? (
                        <img
                          src={URL.createObjectURL(userPhoto)}
                          alt={`${getUserDisplayName(message)} profile`}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-medium bg-opacity-20 flex items-center justify-center">
                          <span className="text-slate-medium text-xs font-medium">
                            {getUserDisplayName(message)
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`px-4 pt-2 pb-3 rounded-lg min-w-0 flex-1 ${
                        isOwnMessage
                          ? "bg-sage-dark text-white"
                          : "bg-white bg-opacity-80 text-slate-dark"
                      } backdrop-blur-sm shadow-sm`}
                    >
                      <div className="mb-2">
                        <span
                          className={`font-inter text-xs font-medium ${
                            isOwnMessage
                              ? "text-white text-opacity-80"
                              : "text-slate-medium"
                          }`}
                        >
                          {getUserDisplayName(message)}
                        </span>
                      </div>
                      <p className="font-young-serif text-sm leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere word-break">
                        {message.content}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing Indicator - Show when OTHER user is typing */}
            {isOtherUserTyping && (
              <div className="flex justify-start">
                <div className="bg-white bg-opacity-40 text-slate-medium px-3 py-1.5 rounded-lg backdrop-blur-sm shadow-sm">
                  <span className="font-inter text-xs italic opacity-80">
                    Typing...
                  </span>
                </div>
              </div>
            )}

            {/* Scroll anchor with padding to ensure typing indicator is fully visible */}
            <div ref={messagesEndRef} className="pb-4" />
          </div>
        </div>

        {/* Scroll Controls */}
        {showScrollToBottom && (
          <div className="absolute right-6 bottom-32 z-20">
            <div className="relative">
              {/* Unread count notification bubble */}
              {unreadCount > 0 && (
                <div className="absolute -top-1 -right-1 bg-sage-dark text-white text-[10px] font-medium rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shadow-lg animate-fade-in z-20">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </div>
              )}

              <button
                onClick={scrollToBottom}
                className="bg-sage-dark bg-opacity-70 hover:bg-sage-darker hover:bg-opacity-80 text-white p-2 rounded-full shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sage-dark focus:ring-offset-2 animate-fade-in backdrop-blur-sm"
                aria-label={
                  unreadCount > 0
                    ? `${unreadCount} new messages - Scroll to bottom`
                    : "Scroll to bottom of conversation"
                }
                title={
                  unreadCount > 0
                    ? `${unreadCount} new messages - Scroll to bottom`
                    : "Scroll to bottom"
                }
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={
                    hasNewMessageFromOther ? "animate-bounce-gentle" : ""
                  }
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Message Input Area */}
        <div className="bg-white bg-opacity-80 backdrop-blur-sm border-t border-gray-border px-6 py-4 flex-shrink-0 relative z-10">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start space-x-3">
              <div className="flex-1">
                <textarea
                  ref={inputRef}
                  value={messageInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    connectionStatus === "connected" && otherUserConnected
                      ? "Type your message... "
                      : "Waiting for connection..."
                  }
                  disabled={
                    connectionStatus !== "connected" || !otherUserConnected
                  }
                  className="message-input-no-scroll w-full h-12 px-4 py-3 border-2 border-gray-border rounded-lg resize-none font-young-serif text-slate-dark placeholder:text-gray-placeholder focus:border-slate-dark focus:outline-none focus:ring-2 focus:ring-slate-dark focus:ring-opacity-20 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors duration-200"
                  rows={1}
                  maxLength={1000}
                  aria-label="Type your message"
                  style={{
                    touchAction: "manipulation",
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                />
                <div className="flex justify-between items-center mt-0.5">
                  <span className="font-inter text-xs text-slate-medium">
                    {messageInput.length}/1000 characters
                  </span>
                  {connectionStatus !== "connected" && (
                    <span className="font-inter text-xs text-red-600">
                      Connection required to send messages
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={handleSendMessage}
                disabled={
                  !messageInput.trim() ||
                  connectionStatus !== "connected" ||
                  !otherUserConnected
                }
                className="bg-sage-dark hover:bg-sage-darker disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 h-12 rounded-lg font-inter font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-sage-dark focus:ring-offset-2 mt-0"
                aria-label="Send message"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Live region for screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {messages.length > 0 &&
          `New message from ${getUserDisplayName(
            messages[messages.length - 1]
          )}`}
      </div>
    </div>
  );
};

export default ChatInterface;
