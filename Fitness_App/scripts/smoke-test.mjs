// End-to-end check of src/api.js against your real Supabase project, using the seed users.
// Run from Fitness_App/:   node scripts/smoke-test.mjs
// Needs Node 20.12+ and a .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
// It creates one test activity ("API smoke test") and one geofence alert. Re-run supabase/seed.sql to wipe them.
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
process.loadEnvFile(path.join(here, '..', '.env'))

const DEMO_PASSWORD = 'demo1234' // same demo password the seed file sets for the @rally.demo users
const NIGHT_WALK = 'a0000000-0000-0000-0000-000000000008'
const ONE_SPOT = 'a0000000-0000-0000-0000-000000000004'

// api.js imports ./supabaseClient (which needs Vite). Build a temp copy that uses a plain client instead.
const clientFile = path.join(here, '.tmp_client.mjs')
const apiFile = path.join(here, '.tmp_api.mjs')
writeFileSync(clientFile, `import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
`)
writeFileSync(apiFile, readFileSync(path.join(here, '..', 'src', 'api.js'), 'utf8').replace("'./supabaseClient'", "'./.tmp_client.mjs'"))

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log('PASS', name) } else { failed++; console.log('FAIL', name, detail) }
}
async function rejects(promise, pattern) {
  try { await promise; return { ok: false, msg: 'did not throw' } } catch (e) { return { ok: pattern.test(e.message), msg: e.message } }
}

try {
  const api = await import(pathToFileURL(apiFile).href + '?t=' + Date.now())
  const login = (who) => api.signIn({ email: `${who}@rally.demo`, password: DEMO_PASSWORD })

  await login('maya')
  const me = await api.getProfile()
  check('login + getProfile', me.fullName === 'Maya Chen' && me.sports.length === 2, JSON.stringify(me))
  check('getSports', (await api.getSports()).length >= 9)

  const near5 = await api.getActivities({ radiusKm: 5 })
  check('getActivities 5 km returns activities with lat/lng/spotsLeft',
    near5.length >= 7 && typeof near5[0].lat === 'number' && typeof near5[0].spotsLeft === 'number', `count=${near5.length}`)
  const near30 = await api.getActivities({ radiusKm: 30 })
  check('bigger radius returns more (includes Oromocto)', near30.length > near5.length && near30.some((a) => a.city && a.title.includes('Oromocto')))
  const basketball = await api.getActivities({ radiusKm: 30, sportId: (await api.getSports()).find((s) => s.name === 'Basketball').id })
  check('sport filter', basketball.length === 1 && basketball[0].sport === 'Basketball')

  const oneSpot = await api.getActivity(ONE_SPOT)
  check('getActivity: one spot left + participants', oneSpot.spotsLeft === 1 && oneSpot.participants.length === 5, `spots=${oneSpot.spotsLeft} p=${oneSpot.participants.length}`)
  const walk = await api.getActivity(NIGHT_WALK)
  check('getActivity: night walk has route', walk.nightMode === true && Array.isArray(walk.route) && walk.route.length === 5)

  // Cap flow on a fresh 1-seat activity
  const made = await api.createActivity({
    sportId: (await api.getSports())[0].id, title: 'API smoke test', description: 'temporary', city: 'Fredericton',
    address: 'test', lat: 45.9636, lng: -66.6431, startsAt: new Date(Date.now() + 3 * 86400000).toISOString(), maxParticipants: 1,
  })
  check('createActivity', made.status === 'open' && made.spotsLeft === 1 && made.hostName === 'Maya Chen')

  await login('liam')
  const joined = await api.joinActivity(made.id)
  check('joinActivity returns qrToken', typeof joined.qrToken === 'string' && joined.qrToken.length > 20)
  const afterJoin = await api.getActivity(made.id)
  check('activity auto-closed at cap', afterJoin.status === 'closed' && afterJoin.spotsLeft === 0, afterJoin.status)
  check('getMyQrToken matches', (await api.getMyQrToken(made.id)) === joined.qrToken)
  const dup = await rejects(api.joinActivity(made.id), /closed|already/i)
  check('joining twice is rejected', dup.ok, dup.msg)

  await login('aisha')
  const late = await rejects(api.joinActivity(made.id), /closed/i)
  check('join after close is rejected', late.ok, late.msg)
  const { supabase } = await import(pathToFileURL(clientFile).href)
  const peek = await supabase.from('activity_participants').select('qr_token').eq('activity_id', made.id)
  check('other users cannot read QR tokens', !!peek.error && /permission denied/i.test(peek.error.message), JSON.stringify(peek))
  const { data: aishaSession } = await supabase.auth.getSession()
  const sneak = await supabase.from('activity_participants').insert({ activity_id: ONE_SPOT, user_id: aishaSession.session.user.id })
  check('direct table insert is blocked (must use joinActivity)', !!sneak.error && /permission denied/i.test(sneak.error.message), JSON.stringify(sneak.error))
  const notHost = await rejects(api.checkIn(joined.qrToken), /not the host|Invalid/i)
  check('non-host cannot check in', notHost.ok, notHost.msg)

  await login('maya')
  const ci = await api.checkIn(joined.qrToken)
  check('host checkIn returns attendee name', ci.name === 'Liam Murphy', JSON.stringify(ci))
  await api.sendMessage(made.id, 'hello from the host')
  check('sendMessage + getMessages', (await api.getMessages(made.id)).length === 1)
  await api.addComment(made.id, 'nice ride')
  check('addComment + getComments', (await api.getComments(made.id))[0]?.authorName === 'Maya Chen')

  await login('liam')
  await api.leaveActivity(made.id)
  check('leaving reopens the listing', (await api.getActivity(made.id)).status === 'open')

  // Night walk: geofence
  await login('maya')
  await api.shareLocation(NIGHT_WALK, 45.99, -66.60) // far off the route
  const alerts = await api.getGeofenceAlerts(NIGHT_WALK)
  check('off-route location raises geofence alert', alerts.length >= 1 && alerts[0].metersOutside > 0, JSON.stringify(alerts[0]))
  const live = await api.getLiveLocations(NIGHT_WALK)
  check('getLiveLocations', live.some((l) => l.fullName === 'Maya Chen' && typeof l.lat === 'number'))
  await api.stopSharingLocation(NIGHT_WALK)
  check('stopSharingLocation', (await api.getLiveLocations(NIGHT_WALK)).length === 0)

  await api.signOut()
} catch (e) {
  failed++
  console.log('FAIL unexpected error:', e.message)
} finally {
  rmSync(clientFile, { force: true })
  rmSync(apiFile, { force: true })
}
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
