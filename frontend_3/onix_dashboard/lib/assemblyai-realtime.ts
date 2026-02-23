/**
 * AssemblyAI Real-Time Transcription Service
 * Handles WebSocket connection to AssemblyAI's real-time API
 */

import { AssemblyAI } from 'assemblyai';

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  timestamp: number;
  isFinal: boolean;
}

export class AssemblyAIRealtimeService {
  private client: AssemblyAI;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(apiKey: string) {
    this.client = new AssemblyAI({ apiKey });
  }

  /**
   * Connect to AssemblyAI real-time transcription
   * Note: This requires a WebSocket connection, which needs to be handled server-side
   */
  async connect(): Promise<void> {
    // AssemblyAI real-time API requires server-side WebSocket connection
    // This will be handled by a separate WebSocket server
    throw new Error('Real-time connection must be established via WebSocket server');
  }

  /**
   * Send audio chunk for transcription
   */
  async sendAudio(audioData: ArrayBuffer): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(audioData);
  }

  /**
   * Close connection
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}


