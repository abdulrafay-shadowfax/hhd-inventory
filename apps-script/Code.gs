// HHD Inventory backend v3.3 (v3.2 + changeStatusBulk + imei_number): Supabase (PostgreSQL). Columns are CapitalCase (Serial, TicketID, ...).
// Secret key lives in Script Properties (Project Settings > Script properties > SUPABASE_KEY), never in code.
// v3.2: Parallel batch requests for 10x speedup on dispatch/ack operations

const SUPABASE_URL = 'https://johvbodujwcnzgyvwndx.supabase.co';
const SUPABASE_KEY = PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY');
const TOKEN_HOURS = 8, MAX_FAILS = 5, LOCK_SECONDS = 900;
const now_ = () => new Date().toISOString();

function api_(table, method = 'GET', body = null, filter = '') {
  const url = SUPABASE_URL + '/rest/v1/' + table + filter;
  const opts = {
    method, headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    }
  };
  if (body) opts.payload = JSON.stringify(body);
  const r = UrlFetchApp.fetch(url, opts);
  return JSON.parse(r.getContentText());
}

// ponytail: parallel batch requests using UrlFetchApp.fetchAll(). ~10x faster than serial forEach loops.
function apiBatch_(requests) {
  if (!requests || !requests.length) return [];
  const responses = UrlFetchApp.fetchAll(requests);
  return responses.map(r => JSON.parse(r.getContentText()));
}

const usr_ = r => ({ user: String(r.Username).toLowerCase(), name: r.Name, role: String(r.Role).toLowerCase(), site: r.Site });
const users_ = () => api_('users').map(usr_);
const siteOk_ = (u, s) => u.role === 'admin' || u.site?.trim() === '*' || u.site?.split(',').map(x => x.trim()).includes(s);

function hex_(bytes) { return bytes.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join(''); }
function hash_(salt, pw) {
  let h = salt + pw;
  for (let i = 0; i < 1000; i++) h = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt));
  return h;
}

function secret_() {
  const P = PropertiesService.getScriptProperties();
  let s = P.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); P.setProperty('SECRET', s); }
  return s;
}
const sig_ = body => Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret_()));

function sign_(o) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(o), Utilities.Charset.UTF_8);
  return body + '.' + sig_(body);
}

function verify_(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || sig_(body) !== sig) return null;
  const t = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(body)).getDataAsString());
  if (!(t.exp > Date.now())) return null;
  const u = api_('users', 'GET', null, `?Username=eq.${encodeURIComponent(t.user)}`)[0];
  return u ? Object.assign(usr_(u), { exp: t.exp }) : null;
}

function login_(p) {
  const name = String(p.username || '').trim().toLowerCase(), cache = CacheService.getScriptCache(), k = 'fail:' + name;
  if (Number(cache.get(k) || 0) >= MAX_FAILS) return { ok: false, error: 'Too many failed attempts. Try again in 15 minutes.' };
  const r = api_('users', 'GET', null, `?Username=eq.${encodeURIComponent(name)}`)[0];
  const [salt, h] = r ? String(r.PasswordHash).split(':') : ['', ''];
  if (!r || !h || hash_(salt, String(p.password || '')) !== h) {
    cache.put(k, String(Number(cache.get(k) || 0) + 1), LOCK_SECONDS);
    return { ok: false, error: 'Invalid username or password' };
  }
  cache.remove(k);
  const exp = Date.now() + TOKEN_HOURS * 3600 * 1000;
  return { ok: true, profile: Object.assign(usr_(r), { token: sign_({ user: name, exp }), exp }) };
}

/* -------- actions -------- */
const need_ = (c, m) => { if (!c) throw new Error(m); };
const admin_ = u => need_(u.role === 'admin', 'Forbidden: admin only');
const STATUSES = ['Working', 'Not-Working', 'In-Transit', 'Handed Over to SS', 'Replacement Received from SS', 'Yet-to-be-find', 'Cannot_be_repaired'];

const ACTIONS = {
  dispatch(p, u) {
    const t = p.ticket || {};
    const serials = [...new Set(String(t.Devices || '').split(',').map(s => s.trim()).filter(Boolean))];
    need_(serials.length, 'No devices in batch');
    need_(t.SenderSite && t.ReceiverSite && t.SenderSite !== t.ReceiverSite, 'Sender and receiver sites must differ');
    need_(siteOk_(u, t.SenderSite), 'Forbidden: not your sender site');
    const rr = api_('users', 'GET', null, `?Username=eq.${encodeURIComponent(String(t.RecipientUser || '').toLowerCase())}`)[0];
    need_(rr, 'Unknown recipient');
    const rcpt = usr_(rr);
    need_(siteOk_(rcpt, t.ReceiverSite), rcpt.name + ' has no access to ' + t.ReceiverSite);

    const devs = api_('devices', 'GET', null, '?Serial=in.' + encodeURIComponent('(' + serials.map(s => '"' + s + '"').join(',') + ')'));
    serials.forEach(s => {
      need_(devs.find(x => x.Serial === s), s + ': not in master stock');
      need_(devs.find(x => x.Serial === s).Status !== 'In-Transit', s + ': is already in transit');
      need_(devs.find(x => x.Serial === s).Location === t.SenderSite, s + ': is at "' + devs.find(x => x.Serial === s).Location + '", not ' + t.SenderSite);
    });

    let id;
    do { id = 'TKT-' + ('0000000' + Math.floor(Math.random() * 1e8)).slice(-8); }
    while (api_('tickets', 'GET', null, `?TicketID=eq.${id}`).length);

    const now = now_();
    api_('tickets', 'POST', {
      TicketID: id, SenderSite: t.SenderSite, ReceiverSite: t.ReceiverSite, SenderName: u.name + ' (' + u.user + ')',
      RecipientName: rcpt.name, Action: t.Action || 'Inter-Site Transfer', Devices: serials.join(', '),
      Status: 'Pending Receipt', DispatchDate: now, AckDate: null, AckBy: '', Remarks: t.Remarks || '', RecipientUser: rcpt.user,
    });
    // OPTIMIZED: Parallel batch PATCH requests instead of serial forEach loop
    const batchRequests = serials.map(s => {
      const dev = devs.find(x => x.Serial === s);
      return {
        url: SUPABASE_URL + '/rest/v1/devices?Serial=eq.' + encodeURIComponent(s),
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        payload: JSON.stringify({ Status: 'In-Transit', PrevStatus: dev.Status, Location: 'In-Transit (To: ' + t.ReceiverSite + ')', LastUpdated: now })
      };
    });
    apiBatch_(batchRequests);
    return { ticketId: id, count: serials.length };
  },

  ack(p, u) {
    const o = api_('tickets', 'GET', null, `?TicketID=eq.${encodeURIComponent(p.ticketId)}`)[0];
    need_(o, 'Ticket not found');
    need_(o.Status === 'Pending Receipt', o.TicketID + ' is not pending');
    need_(String(o.RecipientUser).toLowerCase() === u.user, 'Only ' + o.RecipientName + ' (' + o.RecipientUser + ') can acknowledge this ticket');
    need_(siteOk_(u, o.ReceiverSite), 'Forbidden: no access to ' + o.ReceiverSite);

    const now = now_();
    api_('tickets', 'PATCH', { Status: 'Acknowledged', AckDate: now, AckBy: u.name + ' (' + u.user + ')' }, `?TicketID=eq.${encodeURIComponent(o.TicketID)}`);
    const serials = String(o.Devices).split(',').map(s => s.trim()).filter(Boolean);
    const devs = api_('devices', 'GET', null, '?Serial=in.' + encodeURIComponent('(' + serials.map(s => '"' + s + '"').join(',') + ')'));
    // OPTIMIZED: Parallel batch PATCH requests instead of serial forEach loop
    const batchRequests = serials.map(s => {
      const dev = devs.find(x => x.Serial === s);
      return {
        url: SUPABASE_URL + '/rest/v1/devices?Serial=eq.' + encodeURIComponent(s),
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        payload: JSON.stringify({ Status: dev?.PrevStatus || 'Working', PrevStatus: null, Location: o.ReceiverSite, LastUpdated: now })
      };
    });
    apiBatch_(batchRequests);
    return { ticketId: o.TicketID };
  },

  // Manual status change by a user with access to the device's site. Logged to status_log.
  changeStatus(p, u) {
    const s = String(p.serial || '').trim(), st = p.status;
    need_(STATUSES.includes(st) && st !== 'In-Transit', 'Invalid status');
    const d = api_('devices', 'GET', null, `?Serial=eq.${encodeURIComponent(s)}`)[0];
    need_(d, s + ': not found');
    need_(d.Status !== 'In-Transit', s + ' is in transit; it is updated by ticket acknowledgement');
    need_(siteOk_(u, d.Location), 'Forbidden: no access to ' + d.Location);
    need_(d.Status !== st, s + ' is already ' + st);

    const now = now_();
    // log first: a change can never exist without its audit row
    api_('status_log', 'POST', {
      Serial: s, Location: d.Location, OldStatus: d.Status, NewStatus: st, ChangedAt: now, ChangedBy: u.name + ' (' + u.user + ')',
    });
    api_('devices', 'PATCH', { Status: st, LastUpdated: now }, `?Serial=eq.${encodeURIComponent(s)}`);
    return { serial: s };
  },

  changeStatusBulk(p, u) {
    const sers = [...new Set((p.serials || []).map(s => String(s).trim()).filter(Boolean))], st = p.status;
    need_(sers.length, 'Nothing selected');
    need_(STATUSES.includes(st) && st !== 'In-Transit', 'Invalid status');
    const inList = ss => '?Serial=in.' + encodeURIComponent('(' + ss.map(s => '"' + s + '"').join(',') + ')');
    const devs = api_('devices', 'GET', null, inList(sers));
    // validate everything first: all-or-nothing
    sers.forEach(s => {
      const d = devs.find(x => x.Serial === s);
      need_(d, s + ': not found');
      need_(d.Status !== 'In-Transit', s + ' is in transit; it is updated by ticket acknowledgement');
      need_(siteOk_(u, d.Location), 'Forbidden: no access to ' + d.Location);
    });
    const todo = devs.filter(d => d.Status !== st), now = now_();
    if (todo.length) {
      // log first (one POST for all rows), then one PATCH for all devices
      api_('status_log', 'POST', todo.map(d => ({ Serial: d.Serial, Location: d.Location, OldStatus: d.Status, NewStatus: st, ChangedAt: now, ChangedBy: u.name + ' (' + u.user + ')' })));
      api_('devices', 'PATCH', { Status: st, LastUpdated: now }, inList(todo.map(d => d.Serial)));
    }
    return { count: todo.length };
  },

  importDevices(p, u) {
    admin_(u);
    const items = p.devices || [];
    need_(items.length, 'Nothing to import');
    const seen = {};
    items.forEach((d, i) => {
      const bad = !d.Serial ? 'missing Serial' : seen[d.Serial] ? 'duplicate Serial' : !d.Make || !d.Model ? 'missing Make/Model'
        : STATUSES.indexOf(d.Status) < 0 ? 'bad Status' : !d.Location ? 'missing Location' : '';
      need_(!bad, 'Row ' + (i + 1) + ' (' + d.Serial + '): ' + bad);
      seen[d.Serial] = 1;
      d.LastUpdated = d.LastUpdated || now_();
    });
    // OPTIMIZED: Batch POST requests for device imports
    const batchRequests = items.map(d => ({
      url: SUPABASE_URL + '/rest/v1/devices',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      payload: JSON.stringify({ Serial: d.Serial, imei_number: String(d.imei_number || '').trim() || null, Make: d.Make, Model: d.Model, Status: d.Status, Location: d.Location, LastUpdated: d.LastUpdated })
    }));
    apiBatch_(batchRequests);
    return { count: items.length };
  },

  saveUser(p, u) {
    admin_(u);
    const un = String(p.username || '').trim().toLowerCase(), role = String(p.role || '').toLowerCase();
    need_(/^[a-z0-9._-]{3,32}$/.test(un), 'Username: 3-32 chars, letters/digits . _ -');
    need_(role === 'admin' || role === 'user', 'Role must be admin or user');
    need_(String(p.name || '').trim() && String(p.site || '').trim(), 'Name and Site are required');
    need_(!(un === u.user && role !== 'admin'), 'You cannot remove your own admin role');
    const old = api_('users', 'GET', null, `?Username=eq.${encodeURIComponent(un)}`)[0];
    let stored = old ? old.PasswordHash : '';
    if (p.password) {
      need_(String(p.password).length >= 10, 'Password must be at least 10 characters');
      const salt = Utilities.getUuid().slice(0, 8);
      stored = salt + ':' + hash_(salt, String(p.password));
    }
    need_(stored, 'Password required for a new user');
    if (old) api_('users', 'PATCH', { Name: p.name.trim(), Role: role, Site: p.site.trim(), PasswordHash: stored },
      `?Username=eq.${encodeURIComponent(un)}`);
    else api_('users', 'POST', { Username: un, Name: p.name.trim(), Role: role, Site: p.site.trim(), PasswordHash: stored });
    return { user: un };
  },

  addSite(p, u) {
    admin_(u);
    const s = String(p.site || '').trim();
    need_(s, 'Site name required');
    api_('sites', 'POST', { Site: s });
    return { site: s };
  },
};

/* -------- web app -------- */
const out_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

function doGet(e) {
  try {
    const u = verify_(e.parameter.token);
    if (!u) return out_({ ok: false, error: 'auth' });
    return out_({
      ok: true, version: '3.3', devices: api_('devices'), tickets: api_('tickets'),
      users: users_(), sites: api_('sites').map(x => x.Site),
      // admins see every change, others only changes at sites they can access
      statusLog: api_('status_log', 'GET', null, '?order=ChangedAt.desc&limit=1000').filter(l => siteOk_(u, l.Location)),
    });
  } catch (err) { return out_({ ok: false, error: String(err.message || err) }); }
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.action === 'login') return out_(login_(p));
    const u = verify_(p.token);
    if (!u) return out_({ ok: false, error: 'auth' });
    need_(ACTIONS[p.action], 'Unknown action');
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { return out_(Object.assign({ ok: true }, ACTIONS[p.action](p, u))); }
    finally { lock.releaseLock(); }
  } catch (err) { return out_({ ok: false, error: String(err.message || err) }); }
}

// First-time setup only: run once from the Apps Script editor, sign in, change the password, then delete this function.
function seedAdmin() {
  const salt = Utilities.getUuid().slice(0, 8);
  api_('users', 'POST', { Username: 'admin', Name: 'Administrator', Role: 'admin', Site: '*', PasswordHash: salt + ':' + hash_(salt, 'ChangeMe-12345') });
}