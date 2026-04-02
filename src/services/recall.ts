const RECALL_API_KEY = '6d5b5f5bf401869ffc061797ba5cd9f2e2f7f020';
const RECALL_API_URL = 'https://api.recall.ai/api/v2';

export interface RecallBotConfig {
  meeting_url: string;
  bot_name?: string;
  capture_video?: boolean;
  sarvam_transcription?: boolean;
}

export interface RecordingBot {
  id: string;
  meeting_url: string;
  status: string;
  video_url?: string;
  transcript_url?: string;
  created_at: string;
}

export class RecallService {
  private apiKey = RECALL_API_KEY;
  private baseUrl = RECALL_API_URL;

  async joinMeeting(config: RecallBotConfig): Promise<RecordingBot> {
    const response = await fetch(`${this.baseUrl}/recordingbots`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meeting_url: config.meeting_url,
        bot_name: config.bot_name || 'EchoBrief Bot',
        capture_video: config.capture_video ?? true,
        video_codec: 'h264',
        audio_codec: 'aac',
        chunk_size: 3600,
        real_time_transcription: {
          provider: 'sarvam',
          language: 'en',
        },
        stop_real_time_transcription_on_silence: true,
        real_time_transcription_language: 'en',
        wait_for_ready: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Recall API error: ${response.statusText}`);
    }

    return response.json();
  }

  async getBotStatus(botId: string): Promise<RecordingBot> {
    const response = await fetch(`${this.baseUrl}/recordingbots/${botId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Recall API error: ${response.statusText}`);
    }

    return response.json();
  }

  async stopBot(botId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/recordingbots/${botId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Recall API error: ${response.statusText}`);
    }
  }

  async getTranscript(botId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/recordingbots/${botId}/transcript`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Recall API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.transcript || '';
  }

  extractMeetingUrl(text: string): string | null {
    // Extract Teams, Zoom, or Google Meet URL
    const urls = [
      /https:\/\/(teams\.microsoft\.com\/l\/meetup-join\/[^\s]+)/i,
      /https:\/\/(zoom\.us\/j\/[\d]+[^\s]*)/i,
      /https:\/\/(meet\.google\.com\/[^\s]+)/i,
    ];

    for (const regex of urls) {
      const match = text.match(regex);
      if (match) return match[1];
    }

    return null;
  }

  isTeamsUrl(url: string): boolean {
    return /teams\.microsoft\.com/.test(url);
  }

  isZoomUrl(url: string): boolean {
    return /zoom\.us/.test(url);
  }

  isGoogleMeetUrl(url: string): boolean {
    return /meet\.google\.com/.test(url);
  }

  getPlatform(url: string): 'teams' | 'zoom' | 'google_meet' | null {
    if (this.isTeamsUrl(url)) return 'teams';
    if (this.isZoomUrl(url)) return 'zoom';
    if (this.isGoogleMeetUrl(url)) return 'google_meet';
    return null;
  }
}

export const recallService = new RecallService();
