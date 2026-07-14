// Storage abstraction: uses Supabase (table "logs", columns id/data/updated_at) when
// configured, otherwise falls back transparently to localStorage. Every key used by
// the app (profile, bodyscans, workoutlog) is a row id in that table.

const Storage = (() => {
  const LOCAL_PREFIX = "ironlog_";

  const supabaseReady =
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    !window.SUPABASE_URL.includes("YOUR_SUPABASE_URL") &&
    !window.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");

  function localGet(key) {
    const raw = localStorage.getItem(LOCAL_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  }

  function localSet(key, value) {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  }

  async function supabaseGet(key) {
    const res = await fetch(
      `${window.SUPABASE_URL}/rest/v1/logs?id=eq.${encodeURIComponent(key)}&select=data`,
      {
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!res.ok) throw new Error(`Supabase GET failed: ${res.status}`);
    const rows = await res.json();
    return rows.length ? rows[0].data : null;
  }

  async function supabaseSet(key, value) {
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/logs`, {
      method: "POST",
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ id: key, data: value, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`Supabase POST failed: ${res.status}`);
  }

  return {
    isSynced: supabaseReady,

    async get(key, fallback = null) {
      if (supabaseReady) {
        try {
          const remote = await supabaseGet(key);
          if (remote !== null) {
            localSet(key, remote); // keep local mirror fresh for offline reads
            return remote;
          }
        } catch (e) {
          console.warn("Supabase read failed, using local cache:", e);
        }
      }
      const local = localGet(key);
      return local !== null ? local : fallback;
    },

    async set(key, value) {
      localSet(key, value); // always write local immediately for snappy UI
      if (supabaseReady) {
        try {
          await supabaseSet(key, value);
        } catch (e) {
          console.warn("Supabase write failed, kept local only:", e);
        }
      }
    },
  };
})();
