import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';

export default function HomeworkHelpPage() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a question',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const data = await apiRequest<{ response: string }>('/api/ai-homework-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });
      
      setResponse(data.response);
    } catch (error) {
      console.error('Error getting AI response:', error);
      toast({
        title: 'Error',
        description: 'Failed to get AI response. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto p-4 min-h-screen flex flex-col">
      <div className="mb-4">
        <Link href="/">
          <Button variant="ghost" className="px-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Chat
          </Button>
        </Link>
      </div>
      
      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="text-2xl">AI Homework Help</CardTitle>
          <CardDescription>
            Ask questions about your schoolwork and get AI-powered assistance.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Textarea
                placeholder="Explain the concept of photosynthesis..."
                className="min-h-[120px]"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
              />
            </div>
            
            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading || !prompt.trim()}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Getting Response...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Get Help
                  </>
                )}
              </Button>
            </div>
          </form>
          
          {response && (
            <>
              <Separator className="my-6" />
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Response:</h3>
                <div className="p-4 bg-muted rounded-md whitespace-pre-wrap">
                  {response}
                </div>
              </div>
            </>
          )}
        </CardContent>
        
        <CardFooter className="flex flex-col items-start text-sm text-muted-foreground">
          <p>Note: AI is here to help with understanding concepts, not to provide direct answers for assignments.</p>
        </CardFooter>
      </Card>
    </div>
  );
}