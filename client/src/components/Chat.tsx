import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import type { ChatMessage } from '../types';

interface ChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

export default function Chat({ messages, onSend }: ChatProps) {
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <div className="sidebar-panel chat-panel" style={{ padding: 0 }}>
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <MessageCircle size={26} aria-hidden="true" />
            <span>No messages yet. Say hello 👋</span>
          </div>
        )}
        {messages.map((m) => (
          <div className="chat-message" key={m.id}>
            <span className="chat-avatar" aria-hidden="true">
              {m.username.charAt(0).toUpperCase()}
            </span>
            <span className="chat-message-body">
              <span className="author">{m.username}</span>
              <span className="text">{m.text}</span>
            </span>
          </div>
        ))}
      </div>
      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message"
        />
        <button type="submit" className="btn btn-primary btn-small">
          <Send size={13} aria-hidden="true" />
          Send
        </button>
      </form>
    </div>
  );
}