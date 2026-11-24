// 10 pressure scenarios. {a}=asset name, {alt}=hyped asset name. Percent moves are scaled per asset type
// because an index fund doesn't jump 45% in 3 days – but the *feeling* of pressure must stay realistic.
export const TYPE_ASSET = {
  stock: { name: 'Infosys', alt: 'HypeGreen Energy', price: 1542, mag: 1, noun: 'stock', unit: 'share', crowd: 'traders' },
  mf: { name: 'Quant Small Cap Fund', alt: 'a hot thematic fund', price: 279, mag: 0.7, noun: 'fund', unit: 'unit', crowd: 'investors' },
  index: { name: 'Nifty 50 Index Fund', alt: 'the Midcap 150 Index Fund', price: 58.6, mag: 0.55, noun: 'index fund', unit: 'unit', crowd: 'investors' },
  etf: { name: 'Nifty BeES', alt: 'a trending sector ETF', price: 327, mag: 0.55, noun: 'ETF', unit: 'unit', crowd: 'traders' },
}
export const BIASES = {
  lossAversion: 'Loss aversion', herd: 'Herd behaviour', overconfidence: 'Overconfidence', greed: 'Greed', anchoring: 'Anchoring', recency: 'Recency bias', impulsivity: 'Impulsivity', disposition: 'Disposition effect',
}
// pnl = effect on a ₹50,000 position as a fraction, BEFORE type scaling. `q` = decision quality 0..1.
export const SCENARIOS = [
  {
    id: 1, title: 'The Early Profit Trap', bias: 'disposition', emoji: '💰', seconds: 14,
    story: 'You bought {a} at ₹{p0}. In just 2 days it is up +{up}%. Your phone buzzes with a profit alert.',
    question: 'What do you do right now?', up: 7, from: 100, to: 107, after: [107, 110, 114, 118, 122],
    alerts: [{ at: 1, app: 'TradeApp', title: 'Price alert 🔔', body: '{a} is up +{up}% today!', tone: 'good' }, { at: 5, app: 'WhatsApp', title: 'Rohan', body: 'Book profit before it drops bro 😬', tone: 'warn' }],
    chat: [{ at: 3, name: 'Rohan', text: 'Take the money and run!' }],
    options: [
      { id: 'a', label: 'Sell everything – lock the profit', sub: 'A sure gain feels good', q: 0.2, fx: { disposition: 8, impulsivity: 3 }, pnl: 0.02, text: 'You banked +{up}%, but it kept climbing to +22%.' },
      { id: 'b', label: 'Hold – stick to my +15% target plan', sub: 'My plan was written before I bought', q: 1, fx: {}, pnl: 0.15, text: 'Your plan paid off: you rode the trend to the target.' },
      { id: 'c', label: 'Buy more with the profit', sub: 'It is clearly working!', q: 0.15, fx: { overconfidence: 7, greed: 4 }, pnl: 0.09, text: 'Bigger bet, bigger risk – you got lucky this time.' },
    ],
    lesson: 'Selling winners too early (and holding losers too long) is the "disposition effect". Decide your target before you buy.',
  },
  {
    id: 2, title: 'Crash Panic', bias: 'lossAversion', emoji: '📉', seconds: 13,
    story: 'Breaking: markets crash. {a} falls from ₹{p0} by {dn}% in two weeks. Your portfolio is bright red.',
    question: 'The red numbers keep growing. Your move?', up: 0, dn: 20, from: 100, to: 80, after: [80, 86, 95, 104, 112],
    alerts: [{ at: 1, app: 'TradeApp', title: '⚠ Portfolio −{dn}%', body: 'Your holdings fell sharply today', tone: 'bad' }, { at: 3, app: 'News', title: 'MARKET CRASH', body: 'Sensex plunges, investors lose ₹9 lakh crore', tone: 'bad' }, { at: 6, app: 'Mom', title: 'Missed call (3)', body: 'Beta, are you selling? Call me!', tone: 'warn' }],
    chat: [{ at: 2, name: 'Uncle Raj', text: 'SELL EVERYTHING. It is going to zero!' }, { at: 5, name: 'Priya', text: 'I already sold half 😭' }],
    options: [
      { id: 'a', label: 'Sell everything right now', sub: 'Stop the bleeding', q: 0, fx: { lossAversion: 9, impulsivity: 5, recency: 3 }, pnl: -0.2, text: 'You locked in the loss at the bottom. The market recovered +32% in 3 months without you.' },
      { id: 'b', label: 'Hold and do nothing', sub: 'Crashes are normal, recoveries follow', q: 1, fx: {}, pnl: 0.12, text: 'You waited. Within months prices recovered and you were back in profit.' },
      { id: 'c', label: 'Sell half so I can sleep', sub: 'A compromise', q: 0.45, fx: { lossAversion: 4 }, pnl: -0.04, text: 'You reduced stress but missed part of the rebound.' },
    ],
    lesson: 'Losses feel about twice as painful as equal gains feel good. A plan made while calm beats a decision made in panic.',
  },
  {
    id: 3, title: 'The FOMO Rush', bias: 'herd', emoji: '🚀', seconds: 12,
    story: '{alt} is up +{up}% in 3 days and trending #1 everywhere. {crowdPct}% of {crowd} on the app are buying right now.',
    question: 'Everyone is getting rich. Are you in?', up: 45, from: 100, to: 145, after: [145, 130, 100, 75, 65], crowdPct: 87,
    alerts: [{ at: 1, app: 'Instagram', title: '@stockguru_official', body: '🚀🚀 {alt} to the MOON! Last chance!', tone: 'warn' }, { at: 4, app: 'TradeApp', title: 'Trending 🔥', body: '{alt} most bought today', tone: 'good' }],
    chat: [{ at: 2, name: 'Karan', text: 'I just put ₹1 lakh in! 🔥' }, { at: 4, name: 'Meera', text: 'You will regret it if you skip' }, { at: 7, name: 'Karan', text: 'Up another 8%!!' }],
    options: [
      { id: 'a', label: 'Buy a big amount now – ₹25,000', sub: 'Do not miss it', q: 0, fx: { herd: 9, greed: 5, impulsivity: 4 }, pnl: -0.35, text: 'You bought near the top. It then fell more than 50% in 10 days.' },
      { id: 'b', label: 'Skip – check the numbers first', sub: 'Price rises are not a reason', q: 1, fx: {}, pnl: 0, text: 'The valuation was extreme and the hype ended in a crash. You kept your money.' },
      { id: 'c', label: 'Buy a small test amount – ₹2,000', sub: 'A little will not hurt', q: 0.5, fx: { herd: 4, greed: 2 }, pnl: -0.1, text: 'A small loss, but you still bought for the wrong reason.' },
    ],
    lesson: 'When everyone is buying, the price is already high. FOMO is the most expensive emotion in investing.',
  },
  {
    id: 4, title: 'Revenge Trade', bias: 'recency', emoji: '😤', seconds: 12,
    story: 'Yesterday you lost ₹5,000 on a bad trade. Today {a} looks like a "sure" bounce. You want your money back, now.',
    question: 'How big do you go?', up: 0, from: 100, to: 100, after: [100, 98, 96, 95, 94],
    alerts: [{ at: 1, app: 'TradeApp', title: 'Yesterday: −₹5,000', body: 'Your realised loss', tone: 'bad' }, { at: 4, app: 'Notes', title: 'Reminder', body: '"Never trade angry"', tone: 'warn' }],
    chat: [{ at: 3, name: 'You (inner voice)', text: 'The market owes me this one.' }],
    options: [
      { id: 'a', label: 'Double down – ₹25,000 to win it back', sub: 'One good trade fixes everything', q: 0, fx: { recency: 6, overconfidence: 7, impulsivity: 6, lossAversion: 5 }, pnl: -0.12, text: 'Emotion-driven big bets turned one loss into two.' },
      { id: 'b', label: 'Step back and review my plan', sub: 'No trading while upset', q: 1, fx: {}, pnl: 0, text: 'You protected your capital and your mind.' },
      { id: 'c', label: 'Small position – ₹5,000', sub: 'Stay in the game', q: 0.5, fx: { recency: 3 }, pnl: -0.04, text: 'A controlled risk – but still driven by yesterday\'s loss.' },
    ],
    lesson: 'Trying to "win back" a loss quickly makes bigger losses likely. Take a cooling-off break.',
  },
  {
    id: 5, title: 'The Anchoring Trap', bias: 'anchoring', emoji: '⚓', seconds: 12,
    story: 'Last year {a} traded at ₹{old}. Today it is only ₹{p0} – a {disc}% discount! It "looks so cheap".',
    question: 'Is it a bargain?', up: 0, from: 100, to: 100, after: [100, 94, 88, 84, 80],
    alerts: [{ at: 1, app: 'TradeApp', title: '52-week high: ₹{old}', body: '{a} is {disc}% below its high', tone: 'warn' }, { at: 5, app: 'FinWire', title: 'Earnings warning', body: 'Profit growth slowing sharply', tone: 'bad' }],
    chat: [{ at: 3, name: 'Dev', text: 'It was ₹{old} not long ago! Easy buy.' }],
    options: [
      { id: 'a', label: 'Buy – it is {disc}% cheaper than before', sub: 'Compared to the old price, great deal', q: 0, fx: { anchoring: 9, impulsivity: 2 }, pnl: -0.14, text: 'The price had fallen for a reason. It kept sliding.' },
      { id: 'b', label: 'Check earnings and valuation first', sub: 'Old price is irrelevant', q: 1, fx: {}, pnl: 0, text: 'Earnings were weakening. You avoided a value trap.' },
      { id: 'c', label: 'Wait – maybe it falls further', sub: 'Still thinking about the old price', q: 0.6, fx: { anchoring: 3, recency: 2 }, pnl: 0, text: 'Safe, though still anchored to old prices.' },
    ],
    lesson: 'The price you saw before is just a number. Judge today\'s value by today\'s fundamentals.',
  },
  {
    id: 6, title: 'The "Guaranteed" WhatsApp Tip', bias: 'herd', emoji: '📱', seconds: 11,
    story: 'A stranger in "VIP Profit Group" (4,812 members) says: "INSIDER TIP: {alt} will give 3x in 30 days. Only 10 seats left!"',
    question: 'Do you join the tip?', up: 0, from: 100, to: 100, after: [100, 85, 70, 55, 40], crowdPct: 91,
    alerts: [{ at: 1, app: 'WhatsApp', title: 'VIP Profit Group 🔥', body: 'Rajesh Sir: GUARANTEED 3x. Pay ₹999 to join', tone: 'warn' }, { at: 3, app: 'WhatsApp', title: 'VIP Profit Group 🔥', body: '9 seats left!!', tone: 'bad' }, { at: 6, app: 'WhatsApp', title: 'VIP Profit Group 🔥', body: '3 seats left!!!', tone: 'bad' }],
    chat: [{ at: 2, name: 'Amit_Real', text: 'Made ₹80k last week!! Thanks Sir 🙏' }, { at: 4, name: 'Sneha_Pro', text: 'Joined. Do not miss' }, { at: 7, name: 'Vikas', text: 'Only 3 left!!' }],
    options: [
      { id: 'a', label: 'Join and invest ₹20,000', sub: '4,800 people cannot be wrong', q: 0, fx: { herd: 7, greed: 7, overconfidence: 4, impulsivity: 5 }, pnl: -0.7, text: 'It was a pump-and-dump scam. The group vanished with ₹14,000 of your money.' },
      { id: 'b', label: 'Ignore it and verify registration', sub: 'Guaranteed returns are illegal', q: 1, fx: {}, pnl: 0, text: 'No SEBI registration found. You avoided a scam.' },
      { id: 'c', label: 'Try with just ₹1,000', sub: 'Test it small', q: 0.4, fx: { greed: 4, herd: 3 }, pnl: -0.6, text: 'Small loss, but you funded a scam.' },
    ],
    lesson: 'No one can guarantee returns. Urgency and "limited seats" are classic manipulation tricks.',
  },
  {
    id: 7, title: 'The Stop-Loss Dilemma', bias: 'lossAversion', emoji: '🛑', seconds: 11,
    story: 'You set a stop-loss on {a} at 5% below your buy price. The price just touched it. It could trigger any second.',
    question: 'Do you let your own rule work?', up: 0, from: 100, to: 95, after: [95, 90, 86, 83, 80],
    alerts: [{ at: 1, app: 'TradeApp', title: 'Stop-loss nearly hit ⚠', body: '{a} is 0.4% from trigger', tone: 'bad' }, { at: 4, app: 'TradeApp', title: 'Price below your buy', body: 'Unrealised loss −5%', tone: 'bad' }],
    chat: [{ at: 3, name: 'You (inner voice)', text: 'It will bounce back, surely…' }],
    options: [
      { id: 'a', label: 'Remove the stop-loss – give it room', sub: 'It will surely bounce', q: 0.05, fx: { lossAversion: 8, disposition: 7, overconfidence: 3 }, pnl: -0.2, text: 'The price kept falling. A 5% loss became 20%.' },
      { id: 'b', label: 'Let the stop-loss trigger', sub: 'A rule is a rule', q: 1, fx: {}, pnl: -0.05, text: 'You took a small, planned loss and kept most of your capital.' },
      { id: 'c', label: 'Move the stop lower', sub: 'Just a bit more room', q: 0.3, fx: { lossAversion: 5, disposition: 4 }, pnl: -0.12, text: 'Moving the line is how small losses become big ones.' },
    ],
    lesson: 'A stop-loss only works if you obey it. Moving it is hope, not strategy.',
  },
  {
    id: 8, title: 'Profit Hold vs Greed', bias: 'greed', emoji: '🤑', seconds: 10,
    story: 'You are up ₹8,000 on {a}. Your original target was ₹5,000. A YouTuber says "this will double – never sell!"',
    question: 'Book profit or push your luck?', up: 16, from: 100, to: 116, after: [116, 122, 112, 100, 92],
    alerts: [{ at: 1, app: 'YouTube', title: 'LIVE: Next 10x pick', body: 'Never sell too early!', tone: 'warn' }, { at: 4, app: 'TradeApp', title: 'Target crossed 🎯', body: 'You are above your ₹5,000 target', tone: 'good' }],
    chat: [{ at: 3, name: 'Neha', text: 'I am holding till 200%!' }],
    options: [
      { id: 'a', label: 'Hold everything for more', sub: 'Could double', q: 0.1, fx: { greed: 8, overconfidence: 4 }, pnl: -0.08, text: 'The rally reversed and your profit melted away.' },
      { id: 'b', label: 'Book half, trail a stop for the rest', sub: 'Secure gains, keep upside', q: 1, fx: {}, pnl: 0.12, text: 'You locked in profit and still kept a share of the upside.' },
      { id: 'c', label: 'Sell all immediately', sub: 'Done, no regrets', q: 0.6, fx: { disposition: 5, impulsivity: 2 }, pnl: 0.1, text: 'A solid gain, though you left a little upside behind.' },
    ],
    lesson: 'Plans need exits at both ends. Greed turns winners into losers.',
  },
  {
    id: 9, title: 'Fake News Panic', bias: 'impulsivity', emoji: '📰', seconds: 10,
    story: 'A forwarded post says "{a} CEO RESIGNS!!". The chart drops −{dn}% in minutes. No official source yet.',
    question: 'Decide in seconds. Sell, check, or buy the dip?', up: 0, dn: 8, from: 100, to: 92, after: [92, 95, 100, 104, 108],
    alerts: [{ at: 1, app: 'X (Twitter)', title: 'BREAKING 🚨', body: '{a} CEO resigns amid scandal?', tone: 'bad' }, { at: 4, app: 'TradeApp', title: 'Heavy selling', body: 'Volume 5x normal', tone: 'bad' }],
    chat: [{ at: 2, name: 'Sid', text: 'Confirmed, sell now!!' }, { at: 5, name: 'Anu', text: 'Source? Anyone?' }],
    options: [
      { id: 'a', label: 'Sell immediately', sub: 'Better safe than sorry', q: 0, fx: { impulsivity: 8, recency: 5, lossAversion: 4 }, pnl: -0.08, text: 'It was a rumour. The company denied it and the price recovered.' },
      { id: 'b', label: 'Verify on the official exchange site first', sub: '30 seconds to confirm', q: 1, fx: {}, pnl: 0.04, text: 'You found no announcement, stayed calm and recovered with the price.' },
      { id: 'c', label: 'Buy the dip aggressively', sub: 'Must be an overreaction', q: 0.3, fx: { overconfidence: 6, greed: 3 }, pnl: 0.06, text: 'It worked out, but you were guessing without facts.' },
    ],
    lesson: 'Unverified news is a favourite tool of manipulators. Pause, check the official source, then act.',
  },
  {
    id: 10, title: 'Quit the SIP?', bias: 'recency', emoji: '⏳', seconds: 9,
    story: 'Your {a} has been flat for 6 months. Friends have stopped their SIPs and say an FD pays 7%. Your 1-year return is just +{one}%.',
    question: 'What happens to your monthly investing?', up: 0, one: 4, from: 100, to: 104, after: [104, 112, 125, 142, 168],
    alerts: [{ at: 1, app: 'TradeApp', title: 'SIP due tomorrow', body: '₹5,000 will be debited', tone: 'warn' }, { at: 4, app: 'Bank', title: 'FD rates are 7.2%', body: 'Safe and guaranteed', tone: 'warn' }],
    chat: [{ at: 2, name: 'Group', text: 'Stopped my SIP. Waste of time.' }, { at: 5, name: 'Uncle', text: 'FD is the only safe thing.' }],
    options: [
      { id: 'a', label: 'Stop the SIP and move to FD', sub: 'Disappointing returns', q: 0.05, fx: { recency: 7, lossAversion: 6, impulsivity: 3 }, pnl: -0.0, text: 'You stopped right before the growth phase. Over 5 years the SIP grew +68%.' },
      { id: 'b', label: 'Continue the SIP – judge it in 5 years', sub: 'Wealth is built slowly', q: 1, fx: {}, pnl: 0.3, text: 'Continuing bought more units cheaply. Patience compounded.' },
      { id: 'c', label: 'Pause for 3 months', sub: 'Wait for clarity', q: 0.4, fx: { recency: 4, lossAversion: 3 }, pnl: 0.1, text: 'You missed the cheap units, but you stayed in the market.' },
    ],
    lesson: 'Wealth builds in the boring years. Quitting in a flat patch is how investors miss the next climb.',
  },
]
