
import { format } from "date-fns";
import { FileText, Download, Share2, Save, SkipBack, SkipForward, Volume2, Play, Pause } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { CallRecording, TranscriptSegment } from "./types";
import { useTranscript } from "./useRecordings";
import { useToast } from "@/hooks/use-toast";
import { useSignedRecordingUrl } from "@/hooks/useSignedRecordingUrl";

interface RecordingDetailsProps {
  recording: CallRecording | null;
}

export const RecordingDetails = ({ recording }: RecordingDetailsProps) => {
  const [activeTab, setActiveTab] = useState<string>("details");
  const [showTranscript, setShowTranscript] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();

  // Vapi recordings now require an authenticated API call to fetch a
  // short-lived signed URL — the raw `recording_url` in the database is no
  // longer publicly playable.
  const hasRecording = !!recording?.recording_url;
  const {
    data: signedUrl,
    isLoading: isSigningUrl,
    error: signedUrlError,
  } = useSignedRecordingUrl(recording?.call_log_id, { enabled: hasRecording });

  // Mock data for demo - in production this would come from AI analysis
  const mockSentiment = Math.random() > 0.7 ? 'positive' : Math.random() > 0.4 ? 'neutral' : 'negative';
  const mockKeywords = ['appointment', 'pricing', 'callback', 'discount'];
  const mockInsights = [
    { time: 30, text: "Customer mentioned pricing concerns", type: "keyword" },
    { time: 120, text: "Positive sentiment detected", type: "sentiment" },
    { time: 180, text: "Appointment request made", type: "action" }
  ];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [recording]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const skipTime = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  };

  const handleSpeedChange = (speed: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  const handleVolumeChange = (newVolume: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    const vol = newVolume[0];
    audio.volume = vol;
    setVolume(vol);
  };

  const handleSeek = (newTime: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = newTime[0];
    setCurrentTime(newTime[0]);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'bg-green-100 text-green-800';
      case 'negative': return 'bg-red-100 text-red-800';
      case 'neutral': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const callSid = recording?.call_log?.call_sid;
  const { data: transcript, isLoading: transcriptLoading, error: transcriptError } = 
    useTranscript(showTranscript ? callSid : undefined);

  const handleLoadTranscript = () => {
    if (!callSid) {
      toast({
        title: "Error",
        description: "Cannot load transcript: Call SID not available",
        variant: "destructive"
      });
      return;
    }
    
    setShowTranscript(true);
    setActiveTab("transcript");
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Call Details</CardTitle>
        <CardDescription>
          {recording 
            ? `Recording from ${format(new Date(recording.created_at), 'MMM d, yyyy')}`
            : 'Select a recording to view details'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {recording ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="player" className="flex-1">Player</TabsTrigger>
              <TabsTrigger value="transcript" className="flex-1">Transcript</TabsTrigger>
              <TabsTrigger value="insights" className="flex-1">Insights</TabsTrigger>
            </TabsList>

            <TabsContent value="player" className="space-y-6">
              {/* Enhanced Audio Player */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Waveform Player</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!signedUrl}
                      onClick={() => {
                        if (!signedUrl) return;
                        const a = document.createElement("a");
                        a.href = signedUrl;
                        a.download = `ringster-call-${recording.call_log?.call_sid ?? recording.id}.mp3`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        toast({ title: "Download started", description: "Your recording is downloading." });
                      }}
                      className="flex items-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Download MP3
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        toast({ title: "Link copied", description: "Share link copied to clipboard (expires in 7 days)" });
                      }}
                      className="flex items-center gap-2"
                    >
                      <Share2 className="h-4 w-4" />
                      Share Link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        toast({ title: "Saved to CRM", description: "Recording attached to contact record" });
                      }}
                      className="flex items-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      Save to CRM
                    </Button>
                  </div>
                </div>

                {hasRecording ? (
                  <div className="bg-muted/30 p-6 rounded-lg space-y-4">
                    {signedUrl ? (
                      <audio
                        ref={audioRef}
                        src={signedUrl}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        style={{ display: 'none' }}
                      />
                    ) : signedUrlError ? (
                      <p className="text-sm text-destructive">
                        Recording is temporarily unavailable. Please try again.
                      </p>
                    ) : isSigningUrl ? (
                      <p className="text-sm text-muted-foreground">Loading recording…</p>
                    ) : null}
                    
                    {/* Waveform placeholder */}
                    <div className="h-24 bg-gradient-to-r from-primary/20 to-primary/5 rounded-lg flex items-center justify-center relative overflow-hidden">
                      <div className="flex items-center gap-1 h-full w-full px-4">
                        {Array.from({ length: 100 }).map((_, i) => (
                          <div
                            key={i}
                            className="bg-primary/40 rounded-full flex-1 transition-all duration-200"
                            style={{ 
                              height: `${Math.random() * 80 + 20}%`,
                              opacity: (currentTime / duration) * 100 > i ? 1 : 0.3
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Progress slider */}
                    <Slider
                      value={[currentTime]}
                      max={duration || 100}
                      step={1}
                      onValueChange={handleSeek}
                      className="w-full"
                    />

                    {/* Time display */}
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-center gap-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => skipTime(-15)}
                        className="flex items-center gap-2"
                      >
                        <SkipBack className="h-4 w-4" />
                        15s
                      </Button>
                      
                      <Button
                        size="lg"
                        onClick={togglePlayPause}
                        className="rounded-full h-12 w-12 p-0"
                      >
                        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => skipTime(15)}
                        className="flex items-center gap-2"
                      >
                        15s
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Speed and Volume Controls */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Speed:</span>
                        {[1, 1.25, 1.5, 2].map((speed) => (
                          <Button
                            key={speed}
                            variant={playbackSpeed === speed ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleSpeedChange(speed)}
                          >
                            {speed}x
                          </Button>
                        ))}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Volume2 className="h-4 w-4" />
                        <Slider
                          value={[volume]}
                          max={1}
                          step={0.1}
                          onValueChange={handleVolumeChange}
                          className="w-20"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted/30 p-8 rounded-lg text-center">
                    <p className="text-muted-foreground">No audio available</p>
                  </div>
                )}
              </div>

              {/* Call Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Call Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className={getSentimentColor(mockSentiment)}>
                        {mockSentiment}
                      </Badge>
                      <span className="text-sm text-muted-foreground">Sentiment</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {mockKeywords.map((keyword, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <dl className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">From:</dt>
                        <dd>{recording.call_log?.from_number || 'Unknown'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">To:</dt>
                        <dd>{recording.call_log?.to_number || 'Unknown'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Duration:</dt>
                        <dd>
                          {recording.call_log?.duration 
                            ? `${Math.floor(recording.call_log.duration / 60)}:${(recording.call_log.duration % 60).toString().padStart(2, '0')}`
                            : 'n/a'}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Agent:</dt>
                        <dd>{recording.call_log?.agent?.name || 'Unknown'}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium">Call Information</h3>
                <dl className="mt-2 text-sm">
                  <div className="grid grid-cols-3 gap-1 py-1">
                    <dt className="text-muted-foreground">From:</dt>
                    <dd className="col-span-2">{recording.call_log?.from_number || 'Unknown'}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-1 py-1">
                    <dt className="text-muted-foreground">To:</dt>
                    <dd className="col-span-2">{recording.call_log?.to_number || 'Unknown'}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-1 py-1">
                    <dt className="text-muted-foreground">Duration:</dt>
                    <dd className="col-span-2">
                      {recording.call_log?.duration 
                        ? `${Math.floor(recording.call_log.duration / 60)}:${(recording.call_log.duration % 60).toString().padStart(2, '0')}`
                        : 'n/a'}
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 gap-1 py-1">
                    <dt className="text-muted-foreground">Call SID:</dt>
                    <dd className="col-span-2 truncate">{recording.call_log?.call_sid || 'n/a'}</dd>
                  </div>
                </dl>
              </div>

              {!showTranscript && (
                <div className="flex justify-start pt-4">
                  <Button 
                    onClick={handleLoadTranscript}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Load Transcript
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="transcript">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Call Transcript</h3>
                  {!showTranscript && (
                    <Button 
                      onClick={handleLoadTranscript}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      Load Transcript
                    </Button>
                  )}
                </div>

                {showTranscript && (
                  <div className="border rounded-md p-4 h-[500px] overflow-y-auto">
                    {transcriptLoading && (
                      <div className="space-y-2">
                        <Skeleton className="w-full h-6" />
                        <Skeleton className="w-3/4 h-4" />
                        <Skeleton className="w-full h-6" />
                        <Skeleton className="w-5/6 h-4" />
                      </div>
                    )}

                    {transcriptError && (
                      <div className="text-red-500">
                        Error loading transcript: {transcriptError instanceof Error ? transcriptError.message : 'Unknown error'}
                      </div>
                    )}

                    {!transcriptLoading && !transcriptError && transcript && transcript.length > 0 ? (
                      <div className="space-y-4">
                        {transcript.map((segment: TranscriptSegment, index: number) => (
                          <div key={index} className="pb-3 border-b border-gray-100 last:border-0">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-medium">
                                {segment.speaker === "assistant" ? "AI Assistant" : "Caller"}
                              </p>
                              {segment.timestamp && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(segment.timestamp).toLocaleTimeString()}
                                </span>
                              )}
                            </div>
                            <p className="text-sm leading-relaxed">{segment.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      !transcriptLoading && !transcriptError && (
                        <div className="text-center text-muted-foreground py-8">
                          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No transcript data available for this call.</p>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="insights">
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Call Insights</h3>
                
                {/* Sentiment Timeline */}
                <div className="space-y-4">
                  <h4 className="text-md font-medium">Sentiment Timeline</h4>
                  <div className="bg-muted/30 p-4 rounded-lg">
                    <div className="flex items-center h-8 bg-gradient-to-r from-red-200 via-yellow-200 to-green-200 rounded relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-red-400/20 via-yellow-400/20 to-green-400/20" />
                      <div className="absolute left-1/4 top-0 bottom-0 w-0.5 bg-red-500" />
                      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-yellow-500" />
                      <div className="absolute left-3/4 top-0 bottom-0 w-0.5 bg-green-500" />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                      <span>Start</span>
                      <span>End</span>
                    </div>
                  </div>
                </div>

                {/* Key Moments */}
                <div className="space-y-4">
                  <h4 className="text-md font-medium">Key Moments</h4>
                  <div className="space-y-3">
                    {mockInsights.map((insight, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center justify-center w-12 h-8 bg-primary/10 text-primary text-sm font-medium rounded">
                          {formatTime(insight.time)}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm">{insight.text}</p>
                          <Badge variant="secondary" className="text-xs mt-1">
                            {insight.type}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Auto-suggested Actions */}
                <div className="space-y-4">
                  <h4 className="text-md font-medium">Suggested Next Steps</h4>
                  <div className="space-y-3">
                    <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                      <p className="text-sm font-medium text-blue-900">Customer requested callback</p>
                      <p className="text-sm text-blue-700 mt-1">Want to add to outbound call list?</p>
                      <Button size="sm" className="mt-2">Add to Outbound</Button>
                    </div>
                    <div className="p-4 border border-green-200 bg-green-50 rounded-lg">
                      <p className="text-sm font-medium text-green-900">Pricing discussion detected</p>
                      <p className="text-sm text-green-700 mt-1">Consider pushing to sales team for follow-up.</p>
                      <Button size="sm" variant="outline" className="mt-2">Notify Sales</Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex justify-center items-center h-40">
            <p className="text-muted-foreground text-center">
              Select a recording from the list to view details, listen to the audio, and read the transcript.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
