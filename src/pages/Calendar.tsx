import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, ExternalLink, Video } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CalendarPage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your upcoming meetings
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Connect Calendar Card */}
          <Card className="lg:col-span-2">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                <CalendarIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Connect Your Calendar
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Link your Google Calendar to automatically detect upcoming meetings and get reminders to start recording.
              </p>
              <div className="flex items-center justify-center gap-4">
                <Link to="/settings">
                  <Button variant="accent" className="gap-2">
                    <ExternalLink className="w-4 h-4" />
                    Connect Google Calendar
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Meetings Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="w-5 h-5 text-accent" />
                Today's Meetings
              </CardTitle>
              <CardDescription>
                Meetings scheduled for today
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8 text-center text-muted-foreground">
                <p>No meetings scheduled</p>
                <p className="text-sm mt-1">Connect your calendar to see upcoming meetings</p>
              </div>
            </CardContent>
          </Card>

          {/* This Week */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-primary" />
                This Week
              </CardTitle>
              <CardDescription>
                Upcoming meetings this week
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8 text-center text-muted-foreground">
                <p>No meetings scheduled</p>
                <p className="text-sm mt-1">Connect your calendar to see upcoming meetings</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
