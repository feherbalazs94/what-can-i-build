// Supabase project configuration
// ─────────────────────────────────────────────────────────────
// 1. Go to https://supabase.com and create a new project
// 2. In your project dashboard go to Settings → API
// 3. Copy "Project URL" and "anon / public" key into the values below
// 4. In Authentication → URL Configuration, add your site URL to
//    "Redirect URLs" (e.g. http://localhost:8080 for local dev)
// ─────────────────────────────────────────────────────────────
"use strict";

var SUPABASE_URL = 'https://jtahecdiwbqoqahogxzt.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_-oxIbLBR_au7mgO7jehYBA_GwskWVQ5';

var SUPABASE_CONFIGURED = (
    SUPABASE_URL.indexOf('YOUR_PROJECT') === -1 &&
    SUPABASE_ANON_KEY.indexOf('YOUR_ANON') === -1
);
