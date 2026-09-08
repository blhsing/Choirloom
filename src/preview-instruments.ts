// Recorded sample instruments; harmonic definitions support offline tests and the choir vowel.
export const previewInstruments=[
 {id:'piano',en:'Piano',zh:'鋼琴',harmonics:[1,.45,.22,.12,.07,.03],attack:.006,decay:1.4,sustain:.12},
 {id:'electric-piano',en:'Electric piano',zh:'電鋼琴',harmonics:[1,.12,.35,.04,.09],attack:.008,decay:2,sustain:.15},
 {id:'guitar',en:'Acoustic guitar',zh:'木吉他',harmonics:[1,.65,.35,.2,.12,.08],attack:.004,decay:.8,sustain:.04},
 {id:'classical-guitar',en:'Classical guitar (nylon)',zh:'古典吉他（尼龍弦）',harmonics:[1,.4,.16,.08,.03],attack:.005,decay:1.1,sustain:.035},
 {id:'bass',en:'Electric bass',zh:'電貝斯',harmonics:[1,.45,.18,.08],attack:.012,decay:.7,sustain:.35},
 {id:'strings',en:'Strings',zh:'弦樂',harmonics:[1,.5,.33,.25,.2,.16,.14,.12],attack:.16,decay:.5,sustain:.85},
 {id:'violin',en:'Violin',zh:'小提琴',harmonics:[1,.6,.5,.3,.24,.18,.12],attack:.08,decay:.4,sustain:.8},
 {id:'flute',en:'Flute',zh:'長笛',harmonics:[1,.08,.04,.015],attack:.06,decay:.3,sustain:.9},
 {id:'clarinet',en:'Clarinet',zh:'單簧管',harmonics:[1,.02,.4,.01,.2,.01,.1],attack:.04,decay:.25,sustain:.85},
 {id:'trumpet',en:'Trumpet',zh:'小號',harmonics:[1,.8,.65,.45,.3,.2,.1],attack:.035,decay:.2,sustain:.8},
 {id:'organ',en:'Organ',zh:'管風琴',harmonics:[1,.65,.1,.45,0,.1,0,.2],attack:.012,decay:.1,sustain:1},
 {id:'marimba',en:'Marimba',zh:'馬林巴琴',harmonics:[1,.02,.01,.45,.08,.02],attack:.003,decay:.55,sustain:.015},
 {id:'bells',en:'Bells',zh:'鐘聲',harmonics:[1,.1,.6,.05,.35,.1,.2],attack:.003,decay:2.5,sustain:.08},
 {id:'voice',en:'Choir vowel',zh:'合唱母音',harmonics:[1],attack:.035,decay:.1,sustain:.8},
] as const;
export type PreviewInstrument=typeof previewInstruments[number]['id'];
export function previewInstrument(value:unknown):PreviewInstrument{return previewInstruments.find(i=>i.id===value)?.id||'piano';}
