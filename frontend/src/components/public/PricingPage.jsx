import { Link } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"

const PLANS = [
  {
    name: 'Free',
    price: 0,
    period: null,
    desc: 'Solo devs and small projects',
    cta: 'Get started free',
    href: '/signup',
    accent: false,
    features: [
      '1 board',
      '3 members per board',
      'Kanban columns (unlimited)',
      'Bug cards with metadata capture',
      'Comments & @mentions',
      'Email notifications',
    ],
    missing: [
      'ClickUp / GitHub integration',
      'Dashboard & reports',
      'Custom fields',
      'CSV / PDF export',
    ],
  },
  {
    name: 'Pro',
    price: 19,
    period: 'per seat / month',
    desc: 'Growing QA teams',
    cta: 'Start Pro trial',
    href: '/signup',
    accent: true,
    features: [
      '10 boards',
      '25 members per board',
      'ClickUp integration',
      'GitHub & GitLab integration',
      'Dashboard & reports',
      'CSV & PDF export',
      'Custom fields',
      'Card templates',
      'Priority support',
    ],
    missing: ['Unlimited boards'],
  },
  {
    name: 'Business',
    price: 49,
    period: 'per seat / month',
    desc: 'Agencies and large teams',
    cta: 'Start Business trial',
    href: '/signup',
    accent: false,
    features: [
      'Unlimited boards',
      'Unlimited members',
      'All integrations',
      'All dashboard features',
      'Time tracking',
      'Recurring cards',
      'Import / export',
      'SLA rules',
      'Dedicated support',
    ],
    missing: [],
  },
  {
    name: 'Enterprise',
    price: null,
    period: 'custom pricing',
    desc: 'Custom SLA, SSO & onboarding',
    cta: 'Contact sales',
    href: 'mailto:sales@snagly.app',
    accent: false,
    features: [
      'Everything in Business',
      'Custom data retention',
      'Dedicated account manager',
      'Custom SLA agreement',
      'SSO / SAML (Phase 2)',
    ],
    missing: [],
  },
]

const COMPARE = [
  { label: 'Boards',            free:'1',     pro:'10',      biz:'Unlimited', ent:'Unlimited' },
  { label: 'Members / board',   free:'3',     pro:'25',      biz:'Unlimited', ent:'Unlimited' },
  { label: 'ClickUp integration',free:'—',    pro:'✓',       biz:'✓',         ent:'✓' },
  { label: 'GitHub integration', free:'—',    pro:'✓',       biz:'✓',         ent:'✓' },
  { label: 'Dashboard & reports',free:'—',    pro:'✓',       biz:'✓',         ent:'✓' },
  { label: 'Custom fields',      free:'—',    pro:'✓',       biz:'✓',         ent:'✓' },
  { label: 'Time tracking',      free:'—',    pro:'—',       biz:'✓',         ent:'✓' },
  { label: 'SLA rules',          free:'—',    pro:'—',       biz:'✓',         ent:'✓' },
  { label: 'Import / export',    free:'—',    pro:'—',       biz:'✓',         ent:'✓' },
  { label: 'Dedicated support',  free:'—',    pro:'Email',   biz:'Priority',  ent:'Dedicated' },
]

function Tick() {
  return <span style={{ color:'#00875a', fontWeight:700 }}>✓</span>
}
function Cross() {
  return <span style={{ color:'#dfe1e6' }}>—</span>
}

export default function PricingPage() {
  const { user } = useAuthStore()

  return (
    <div style={{ fontFamily:F, background:'#f4f5f7', minHeight:'100vh', color:'#172b4d' }}>

      {/* Nav */}
      <nav style={{
        background:'#052f2a', height:48, display:'flex', alignItems:'center',
        padding:'0 24px', position:'sticky', top:0, zIndex:100,
        boxShadow:'0 2px 8px rgba(0,0,0,.2)',
      }}>
        <Link to="/" style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none' }}>
          <img src="/favicon.svg" alt="Snagly" style={{ width:28, height:28, borderRadius:6 }} />
          <span style={{ color:'#fff', fontWeight:800, fontSize:16, letterSpacing:-.3 }}>Snagly</span>
        </Link>
        <div style={{ flex:1 }} />
        {user ? (
          <Link to="/boards" style={navBtnStyle(true)}>Go to app →</Link>
        ) : (
          <div style={{ display:'flex', gap:8 }}>
            <Link to="/login" style={navBtnStyle(false)}>Log in</Link>
            <Link to="/signup" style={navBtnStyle(true)}>Start free</Link>
          </div>
        )}
      </nav>

      {/* Header */}
      <div style={{
        background:'linear-gradient(135deg,#052f2a,#0f9e8e)',
        padding:'52px 24px 44px', textAlign:'center', color:'#fff',
      }}>
        <h1 style={{ fontSize:'clamp(24px,4vw,40px)', fontWeight:800, letterSpacing:-.5, marginBottom:10 }}>
          Simple, honest pricing
        </h1>
        <p style={{ color:'rgba(255,255,255,.75)', fontSize:15 }}>
          Start free. No credit card required. Upgrade when your team grows.
        </p>
      </div>

      {/* Plan cards */}
      <div style={{ maxWidth:1080, margin:'0 auto', padding:'0 16px' }}>
        <div style={{
          display:'grid',
          gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',
          gap:16,
          transform:'translateY(-28px)',
        }}>
          {PLANS.map(plan => (
            <div key={plan.name} style={{
              background:'#fff',
              borderRadius:6,
              boxShadow: plan.accent
                ? '0 0 0 2px #0f9e8e, 0 8px 24px rgba(0,82,204,.18)'
                : '0 1px 3px rgba(9,30,66,.12),0 0 0 1px rgba(9,30,66,.08)',
              display:'flex', flexDirection:'column',
              overflow:'hidden',
              position:'relative',
            }}>
              {plan.accent && (
                <div style={{
                  background:'#0f9e8e', color:'#fff', fontSize:11, fontWeight:700,
                  textAlign:'center', padding:'5px 0', letterSpacing:.5, textTransform:'uppercase',
                }}>
                  Most popular
                </div>
              )}

              <div style={{ padding:'24px 20px 0' }}>
                <div style={{ fontSize:18, fontWeight:800, color:'#172b4d', marginBottom:2 }}>{plan.name}</div>
                <div style={{ fontSize:12, color:'#5e6c84', marginBottom:16 }}>{plan.desc}</div>

                {plan.price === null ? (
                  <div style={{ fontSize:26, fontWeight:800, color:'#172b4d', marginBottom:4 }}>Custom</div>
                ) : plan.price === 0 ? (
                  <div style={{ fontSize:30, fontWeight:800, color:'#172b4d', marginBottom:4 }}>Free</div>
                ) : (
                  <div style={{ marginBottom:4 }}>
                    <span style={{ fontSize:30, fontWeight:800, color:'#172b4d' }}>${plan.price}</span>
                    <span style={{ fontSize:12, color:'#5e6c84', marginLeft:4 }}>{plan.period}</span>
                  </div>
                )}

                <div style={{ height:1, background:'#ebecf0', margin:'16px 0' }} />

                <ul style={{ listStyle:'none', padding:0, margin:'0 0 20px', display:'flex', flexDirection:'column', gap:7 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ fontSize:13, color:'#172b4d', display:'flex', gap:8, alignItems:'flex-start' }}>
                      <span style={{ color:'#00875a', fontWeight:700, flexShrink:0, marginTop:1 }}>✓</span>
                      {f}
                    </li>
                  ))}
                  {(plan.missing || []).map(f => (
                    <li key={f} style={{ fontSize:13, color:'#8993a4', display:'flex', gap:8, alignItems:'flex-start', textDecoration:'line-through' }}>
                      <span style={{ color:'#dfe1e6', flexShrink:0 }}>—</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ marginTop:'auto', padding:'0 20px 24px' }}>
                {plan.href.startsWith('mailto:') ? (
                  <a href={plan.href} style={ctaStyle(plan.accent)}>
                    {plan.cta}
                  </a>
                ) : (
                  <Link to={plan.href} style={ctaStyle(plan.accent)}>
                    {plan.cta}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison table */}
      <div style={{ maxWidth:900, margin:'0 auto 64px', padding:'0 16px' }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#172b4d', marginBottom:16, textAlign:'center' }}>
          Full feature comparison
        </h2>
        <div style={{ background:'#fff', borderRadius:6, boxShadow:'0 1px 3px rgba(9,30,66,.12),0 0 0 1px rgba(9,30,66,.08)', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:F }}>
            <thead>
              <tr style={{ background:'#f4f5f7' }}>
                <th style={{ ...thStyle, textAlign:'left' }}>Feature</th>
                {['Free','Pro','Business','Enterprise'].map(h => (
                  <th key={h} style={{ ...thStyle, color: h==='Pro' ? '#0f9e8e' : '#5e6c84' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row, i) => (
                <tr key={row.label} style={{ background: i%2===0 ? '#fff' : '#f4f5f7' }}>
                  <td style={{ ...tdStyle, fontWeight:600 }}>{row.label}</td>
                  {[row.free, row.pro, row.biz, row.ent].map((v, j) => (
                    <td key={j} style={{ ...tdStyle, textAlign:'center',
                      color: v==='✓'||v==='Priority'||v==='Email'||v==='Unlimited'||v==='Dedicated' ? '#00875a' : v==='—' ? '#dfe1e6' : '#172b4d',
                      fontWeight: v==='✓' ? 700 : 400,
                    }}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ textAlign:'center', fontSize:13, color:'#8993a4', marginTop:14 }}>
          All prices in USD · Annual billing available — save 20% ·{' '}
          <a href="mailto:support@snagly.app" style={{ color:'#0f9e8e', textDecoration:'none' }}>Questions? Contact us</a>
        </p>
      </div>

      {/* Footer */}
      <footer style={{ background:'#172b4d', padding:'20px 32px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <img src="/favicon.svg" alt="Snagly" style={{ width:22, height:22, borderRadius:4 }} />
          <span style={{ color:'#fff', fontWeight:700, fontSize:14 }}>Snagly</span>
        </div>
        <div style={{ display:'flex', gap:20 }}>
          {[['Home','/'],['Login','/login'],['Sign up','/signup']].map(([t,h])=>(
            <Link key={t} to={h} style={{ color:'rgba(255,255,255,.5)', fontSize:13, textDecoration:'none' }}>{t}</Link>
          ))}
        </div>
        <div style={{ color:'rgba(255,255,255,.3)', fontSize:12 }}>© 2026 NMG Technologies</div>
      </footer>
    </div>
  )
}

const navBtnStyle = accent => ({
  color: accent ? '#fff' : 'rgba(255,255,255,.85)',
  textDecoration:'none',
  fontSize:13,
  fontWeight: accent ? 700 : 500,
  padding:'6px 14px',
  borderRadius:4,
  background: accent ? '#0f9e8e' : 'rgba(255,255,255,.15)',
})

const ctaStyle = accent => ({
  display:'block',
  width:'100%',
  textAlign:'center',
  padding:'9px 0',
  borderRadius:4,
  fontSize:14,
  fontWeight:700,
  textDecoration:'none',
  boxSizing:'border-box',
  background: accent ? '#0f9e8e' : '#f4f5f7',
  color: accent ? '#fff' : '#172b4d',
  border: accent ? 'none' : '1px solid #dfe1e6',
})

const thStyle = {
  padding:'10px 16px',
  fontSize:11,
  fontWeight:700,
  color:'#5e6c84',
  textTransform:'uppercase',
  letterSpacing:.5,
  textAlign:'center',
  borderBottom:'1px solid #dfe1e6',
}

const tdStyle = {
  padding:'10px 16px',
  fontSize:13,
  borderBottom:'1px solid #ebecf0',
}
