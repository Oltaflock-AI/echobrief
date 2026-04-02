import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  location?: string
  organizer?: { displayName?: string; email?: string }
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>
  hangoutLink?: string
  conferenceData?: { entryPoints?: Array<{ uri?: string }> }
}

async function syncGoogleCalendar(
  userId: string,
  calendarId: string,
  accessToken: string
): Promise<{ success: boolean; eventsAdded: number; error?: string }> {
  try {
    // Fetch events from Google Calendar API
    const now = new Date().toISOString()
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(now)}&maxResults=50&orderBy=startTime&singleEvents=true`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Google API error: ${response.status} ${error}`)
    }

    const data = await response.json()
    const events: GoogleCalendarEvent[] = data.items || []

    console.log(`Syncing ${events.length} events from Google Calendar ${calendarId}`)

    // Insert events into calendar_events table
    const eventInserts = events.map((event) => {
      const startTime = event.start?.dateTime || event.start?.date
      const endTime = event.end?.dateTime || event.end?.date

      return {
        user_id: userId,
        calendar_id: calendarId,
        event_id: event.id,
        title: event.summary,
        description: event.description,
        start_time: startTime,
        end_time: endTime,
        location: event.location,
        meeting_link: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri,
        organizer_name: event.organizer?.displayName,
        organizer_email: event.organizer?.email,
        attendees: event.attendees || [],
        is_recurring: false,
        raw_data: event,
      }
    })

    if (eventInserts.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('calendar_events')
        .upsert(eventInserts, { onConflict: 'calendar_id,event_id' })

      if (insertError) {
        throw new Error(`Failed to insert events: ${insertError.message}`)
      }
    }

    // Update last_synced_at timestamp
    await supabaseClient
      .from('calendars')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', calendarId)

    return { success: true, eventsAdded: eventInserts.length }
  } catch (error: any) {
    console.error('Google Calendar sync error:', error.message)
    return { success: false, eventsAdded: 0, error: error.message }
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { user_id, calendar_ids }: { user_id: string; calendar_ids?: string[] } = await req.json()

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400 })
    }

    console.log(`Starting calendar sync for user ${user_id}`)

    // Fetch user's active Google calendars
    let calendarsToSync: any[] = []

    if (calendar_ids && calendar_ids.length > 0) {
      // Sync specific calendars
      const { data, error } = await supabaseClient
        .from('calendars')
        .select('*')
        .eq('user_id', user_id)
        .in('id', calendar_ids)
        .eq('is_active', true)
        .eq('provider', 'google')

      if (error) throw error
      calendarsToSync = data || []
    } else {
      // Sync all active Google calendars
      const { data, error } = await supabaseClient
        .from('calendars')
        .select('*')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .eq('provider', 'google')
        .eq('sync_enabled', true)

      if (error) throw error
      calendarsToSync = data || []
    }

    if (calendarsToSync.length === 0) {
      return new Response(
        JSON.stringify({ success: true, totalEvents: 0, calendars: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get access token from user's Google OAuth
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('google_access_token')
      .eq('user_id', user_id)
      .single()

    if (profileError || !profile?.google_access_token) {
      throw new Error('Google access token not found')
    }

    // Sync each calendar
    let totalEvents = 0
    const results: any[] = []

    for (const calendar of calendarsToSync) {
      const result = await syncGoogleCalendar(user_id, calendar.calendar_id, profile.google_access_token)
      if (result.success) {
        totalEvents += result.eventsAdded
      }
      results.push({ calendar_id: calendar.id, ...result })
    }

    console.log(`Sync complete: ${totalEvents} events synced across ${calendarsToSync.length} calendars`)

    return new Response(
      JSON.stringify({
        success: true,
        totalEvents,
        calendarsCount: calendarsToSync.length,
        results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Calendar sync error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
