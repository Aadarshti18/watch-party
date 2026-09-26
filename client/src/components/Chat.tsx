import { useEffect, useRef, useState } from 'react';
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
        {messages.length === 0 && <div className="empty-state">No messages yet. Say hello.</div>}
        {messages.map((m) => (
          <div className="chat-message" key={m.id}>
            <span className="author">{m.username}</span>
            <span className="text">{m.text}</span>
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
          Send
        </button>
      </form>
    </div>
  );
}
