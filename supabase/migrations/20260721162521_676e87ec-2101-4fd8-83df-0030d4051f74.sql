SELECT cron.schedule(
  'qualification-reengagement-worker',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := 'https://owxcdevylkljaiilevav.supabase.co/functions/v1/qualification-reengagement-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93eGNkZXZ5bGtsamFpaWxldmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTY3NTgsImV4cCI6MjA5NTA5Mjc1OH0.LT22_BP-5ujV8bir3oTIXzCODpORAZy1w75-L2cL4rY'
    ),
    body := jsonb_build_object('trigger','cron')
  );$$
);