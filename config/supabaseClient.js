// config/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Remplace par tes vraies valeurs Supabase
const SUPABASE_URL = 'https://rxwkunzzgbjcwdywkuqo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4d2t1bnp6Z2JqY3dkeXdrdXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzNjcyMjksImV4cCI6MjA3OTk0MzIyOX0.ktKR1MOMFFALWhb321bQYRn8D79r0OMbPz5u0bSUm9g';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
