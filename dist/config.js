// Public browser configuration. Never put a secret/service_role key here.
export const config = Object.freeze({
  storage: 'auto', // localhost: localServerStore; hosted: Supabase. ?storage=cloud previews login locally.
  supabaseUrl: 'https://qevoxzrcoabtuakywyzd.supabase.co',
  supabaseKey: 'sb_publishable_UTqmK6Zhiv8_6FB0QBF_iQ_AJs7KA5y',
  sdkUrl: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm'
});
