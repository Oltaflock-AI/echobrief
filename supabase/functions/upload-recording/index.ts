import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Verify auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify the user's token
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse form data
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const title = formData.get("title") as string || `Meeting ${new Date().toLocaleDateString()}`;
    const source = formData.get("source") as string || "chrome-extension";
    const meetingUrl = formData.get("meeting_url") as string || null;
    const durationSeconds = parseInt(formData.get("duration_seconds") as string) || 0;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: "No audio file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Received upload:", {
      title,
      source,
      fileSize: audioFile.size,
      fileType: audioFile.type,
      duration: durationSeconds
    });

    // Use service role for storage operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${user.id}/${timestamp}_recording.webm`;

    // Upload audio to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(fileName, audioFile, {
        contentType: audioFile.type || "audio/webm",
        upsert: false
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload audio file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Audio uploaded to storage:", uploadData.path);

    // Create meeting record
    const startTime = new Date(Date.now() - (durationSeconds * 1000));
    const endTime = new Date();

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .insert({
        user_id: user.id,
        title,
        source,
        meeting_link: meetingUrl,
        audio_url: `recordings/${fileName}`,
        status: "uploaded",
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_seconds: durationSeconds
      })
      .select()
      .single();

    if (meetingError) {
      console.error("Meeting insert error:", meetingError);
      return new Response(
        JSON.stringify({ error: "Failed to create meeting record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Meeting created:", meeting.id);

    // Trigger processing in background
    const processUrl = `${supabaseUrl}/functions/v1/process-meeting`;
    
    fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        meetingId: meeting.id,
        sendEmail: true
      })
    }).catch(err => {
      console.error("Failed to trigger processing:", err);
    });

    return new Response(
      JSON.stringify({
        success: true,
        meetingId: meeting.id,
        message: "Recording uploaded, processing started"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Upload error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Upload failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
