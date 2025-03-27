import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Send } from 'lucide-react';
import AudioRecorder from 'audio-recorder-polyfill';

interface VoiceRecorderProps {
  onSendVoiceMessage: (voiceData: string, voiceDuration: number) => void;
  placeholder?: string;
}

export function VoiceRecorder({ onSendVoiceMessage, placeholder = "Voice message" }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const recorderRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Initialize audio recorder
  useEffect(() => {
    // Use the polyfill if needed
    window.MediaRecorder = window.MediaRecorder || AudioRecorder;

    return () => {
      // Cleanup timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Cleanup audio URL
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Format recording time as mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorderRef.current.addEventListener('dataavailable', (e: BlobEvent) => {
        audioChunksRef.current.push(e.data);
      });

      recorderRef.current.addEventListener('stop', () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Convert to base64 for sending
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          setAudioDuration(recordingTime);
        };
        
        // Stop the microphone
        stream.getTracks().forEach(track => track.stop());
      });

      recorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start the timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.stop();
      setIsRecording(false);
      
      // Clear the timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Cancel recording
  const cancelRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.stop();
      setIsRecording(false);
      
      // Clear the timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Clear the audio URL
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      
      setRecordingTime(0);
    }
  };

  // Send the recorded message
  const sendRecording = () => {
    if (audioUrl && audioDuration > 0) {
      onSendVoiceMessage(audioUrl, audioDuration);
      
      // Reset state
      setAudioUrl(null);
      setRecordingTime(0);
      setAudioDuration(0);
    }
  };

  return (
    <div className="voice-recorder-container flex items-center gap-2">
      {isRecording ? (
        <>
          <div className="recording-indicator flex items-center gap-3 flex-grow">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse mr-2"></div>
              <span className="recording-time text-sm font-medium">{formatTime(recordingTime)}</span>
            </div>
            <div className="waveform-animation flex-grow h-6 bg-gray-100 rounded-md">
              {/* Simple animation for recording visualization */}
              <div className="h-full bg-gradient-to-r from-primary to-primary/40 rounded-md animate-pulse" style={{ width: `${Math.min(100, recordingTime * 5)}%` }}></div>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={stopRecording} 
            className="h-10 w-10 rounded-full bg-gray-100 hover:bg-gray-200"
          >
            <Square className="h-5 w-5 text-gray-600" />
          </Button>
        </>
      ) : audioUrl ? (
        <>
          <div className="audio-preview flex items-center gap-3 flex-grow">
            <span className="text-sm font-medium">{formatTime(audioDuration)}</span>
            <div className="waveform h-6 flex-grow bg-gray-100 rounded-md">
              <div className="h-full bg-primary rounded-md" style={{ width: '100%' }}></div>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={cancelRecording} 
            className="h-10 w-10 rounded-full bg-gray-100 hover:bg-gray-200"
          >
            <Square className="h-5 w-5 text-gray-600" />
          </Button>
          <Button 
            variant="default" 
            size="icon" 
            onClick={sendRecording} 
            className="h-10 w-10 rounded-full"
          >
            <Send className="h-5 w-5" />
          </Button>
        </>
      ) : (
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={startRecording} 
          className="h-10 w-10 rounded-full bg-gray-100 hover:bg-gray-200"
        >
          <Mic className="h-5 w-5 text-gray-600" />
        </Button>
      )}
    </div>
  );
}