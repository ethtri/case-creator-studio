import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  SHIPPING_OFFER_ID, isOfferEligible, offerSessionExpiry, offerLifecycle, offerRequestHash,
} from '../supabase/functions/_shared/shipping-offer.ts';
import { createOfferCheckout, reconcileShippingOffer, quoteShippingOffer } from '../supabase/functions/_shared/shipping-offer-checkout.ts';
import { createHostedCheckoutRunner } from '../src/lib/checkout-session.ts';
const now = Math.floor(Date.now()/1000);
const config = { id: SHIPPING_OFFER_ID, enabled:true, starts_at:new Date((now-10)*1000).toISOString(),
  ends_at:new Date((now-10+604800)*1000).toISOString(), eligible_variants:{'iphone-15':17722},
  published_us_rate_verified:true, cost_evidence:'fixture-only' };
const input = { items:[{variantId:'iphone-15',quantity:1}], hasPromo:false, provider:'printful', synthetic:false };
test('eligibility is exact, server-owned and fail-closed', () => {
  assert.equal(isOfferEligible(config,input,now),true);
  for(const c of [null,{...config,enabled:false},{...config,eligible_variants:{}},
    {...config,cost_evidence:''},{...config,published_us_rate_verified:false},
    {...config,ends_at:new Date((now+900000)*1000).toISOString()}]) assert.equal(isOfferEligible(c,input,now),false);
  for(const i of [{...input,hasPromo:true},{...input,synthetic:true},{...input,provider:'onshore_manual'},
    {...input,items:[{variantId:'iphone-15',quantity:2}]},{...input,items:[{variantId:'other',quantity:1}]},
    {...input,items:[]}]) assert.equal(isOfferEligible(config,i,now),false);
  const end=Date.parse(config.ends_at)/1000;
  assert.equal(isOfferEligible(config,input,end-1860),false);
  assert.equal(isOfferEligible(config,input,now-20),false);
  assert.equal(offerSessionExpiry(end-2000,end),end);
  assert.throws(()=>offerSessionExpiry(end-1800,end));
});
test('lifecycle holds pending, uncertain and refunded slots',()=>{
  assert.equal(offerLifecycle({id:'x',status:'complete',payment_status:'unpaid'}),'reserved');
  assert.equal(offerLifecycle({id:'x',status:'open',payment_status:'unpaid'}),'reserved');
  assert.equal(offerLifecycle({id:'x',status:'expired',payment_status:'paid'}),'reserved');
  assert.equal(offerLifecycle({id:'x',status:'expired',payment_status:'unpaid'}),'released');
  assert.equal(offerLifecycle({id:'x',status:'complete',payment_status:'paid'}),'paid');
});
test('payload binding includes consent, attribution, destination origin and identity',async()=>{
  const base={email:'fixture@example.test',origin:'https://www.snapcase.ai',analyticsConsent:'granted',marketingAttribution:{firstTouch:'a',lastTouch:'b'}};
  const hash=await offerRequestHash(base);
  assert.equal(hash.length,64);
  assert.equal(await offerRequestHash(base),hash);
  for(const b of [{...base,analyticsConsent:'denied'},{...base,origin:'https://example.test'},
    {...base,marketingAttribution:{firstTouch:'a',lastTouch:'c'}},{...base,email:'other@example.test'}]) assert.notEqual(await offerRequestHash(b),hash);
});
function fixture() {
  const rows=new Map(), sessions=new Map(), orders=new Map(); let createCalls=0, failOrder=false;
  const db={rpc:async(name,p)=>{
    if(name==='reserve_shipping_offer') {
      const existing=rows.get(p.p_attempt_id);
      if(existing) return existing.request_hash===p.p_request_hash?{data:{...existing}}:{error:Error('mismatch')};
      if([...rows.values()].filter(r=>r.state!=='released').length>=10) return {data:null};
      const row={attempt_id:p.p_attempt_id,request_hash:p.p_request_hash,state:'reserved',expires_at_seconds:now+3600};
      rows.set(p.p_attempt_id,row);return {data:{...row}};
    }
    if(name==='bind_shipping_offer_session'||name==='settle_shipping_offer') {
      const r=rows.get(p.p_attempt_id);
      if(!r||r.request_hash!==p.p_request_hash||(r.session_id&&r.session_id!==p.p_session_id)) return {error:Error('binding')};
      r.session_id=p.p_session_id;
      if(name==='settle_shipping_offer'&&r.state!=='paid') r.state=p.p_state;
    }
    return {data:null,error:null};
  },from(table){let operation,body,filter;const q={
    upsert(b){operation='upsert';body=b;return q;},update(b){operation='update';body=b;return q;},
    select(){operation='select';return q;},eq(k,v){filter=[k,v];return q;},neq(){return q;},
    single(){return q;},maybeSingle(){return q;},then(resolve,reject){return Promise.resolve().then(()=>{
      if(table==='shipping_offer_config')return {data:config};
      if(table==='shipping_offer_reservations')return filter ? {data:rows.get(filter[1])??null} : {count:[...rows.values()].filter(r=>r.state!=='released').length};
      if(table==='orders'){
        if(operation==='upsert') {if(failOrder)return {error:Error('db failure')};if(!orders.has(body.stripe_session_id))orders.set(body.stripe_session_id,{...body,id:randomUUID()});return {};}
        return {data:orders.get(filter[1])};
      }return {};
    }).then(resolve,reject);}};return q;}};
  const stripe={checkout:{sessions:{async create(params,options){
    createCalls++;let session=sessions.get(options.idempotencyKey);
    if(!session){session={...params,id:'cs_test_'+randomUUID().replaceAll('-',''),status:'open',payment_status:'unpaid',
      total_details:{amount_shipping:0},url:'https://checkout.stripe.com/c/pay/cs_test_example'};sessions.set(options.idempotencyKey,session);}
    return session;},async retrieve(id){const session=[...sessions.values()].find(s=>s.id===id);if(!session)throw Error('not found');return session;}}}};
  const request={checkoutAttemptId:randomUUID(),items:[{variantId:'iphone-15',quantity:1,price:0.01,brand:'Apple',model:'iPhone 15',edmTemplateId:12}],
    marketingAttribution:{firstTouch:{utm_source:'first'},lastTouch:{utm_source:'last'}},analyticsConsent:'denied'};
  return {db,stripe,rows,sessions,orders,request,get createCalls(){return createCalls;},set failOrder(v){failOrder=v;},
    run(req=request){return createOfferCheckout({db,stripe,enabled:true,origin:'https://www.snapcase.ai'},
      {request:req,email:'fixture@example.test',userId:null,provider:'printful',synthetic:false});}};
}
test('concurrent retries create one bound order and Stripe Session at zero shipping',async()=>{
  const f=fixture();const results=await Promise.all(Array.from({length:20},()=>f.run()));
  assert.equal(f.rows.size,1);assert.equal(f.sessions.size,1);assert.equal(f.orders.size,1);
  assert.ok(results.every(r=>r.sessionId===results[0].sessionId));
  const session=[...f.sessions.values()][0];assert.equal(session.shipping_options[0].shipping_rate_data.fixed_amount.amount,0);
  assert.equal(session.allow_promotion_codes,false);assert.deepEqual(session.shipping_address_collection.allowed_countries,['US']);
  assert.equal(session.after_expiration.recovery.enabled,false);
  const order=[...f.orders.values()][0];assert.equal(order.shipping_cost,0);assert.equal(order.total,29.99);
  assert.equal(order.analytics_consent,'denied');assert.deepEqual(order.marketing_attribution,f.request.marketingAttribution);
});
test('unknown creation/database failure holds slot and retry reuses session',async()=>{
  const f=fixture();f.failOrder=true;await assert.rejects(f.run());
  assert.equal(f.rows.size,1);assert.equal([...f.rows.values()][0].state,'reserved');assert.equal(f.sessions.size,1);
  f.failOrder=false;await f.run();assert.equal(f.sessions.size,1);assert.equal(f.orders.size,1);
  await assert.rejects(f.run({...f.request,analyticsConsent:'granted'}));
  assert.equal(f.sessions.size,1);
});
test('capacity denial updates quote and never creates eleventh session',async()=>{
  const f=fixture();const results=await Promise.all(Array.from({length:25},()=>f.run({...f.request,checkoutAttemptId:randomUUID()})));
  assert.equal(f.sessions.size,10);assert.equal(results.filter(r=>r.quoteChanged).length,15);
  assert.equal(await quoteShippingOffer(f.db,false,input).then(q=>q.shippingCents),499);
});
test('provider readback, not event snapshot, controls release; paid never recycles',async()=>{
  const f=fixture();await f.run();const s=[...f.sessions.values()][0];
  const old={...s,status:'expired'};await reconcileShippingOffer(f.db,f.stripe,old);
  assert.equal([...f.rows.values()][0].state,'reserved');
  s.status='complete';s.payment_status='paid';await reconcileShippingOffer(f.db,f.stripe,s);
  s.status='expired';s.payment_status='unpaid';await reconcileShippingOffer(f.db,f.stripe,s);
  assert.equal([...f.rows.values()][0].state,'paid');
});
test('quote change never redirects or tracks begin_checkout before buyer review',async()=>{
  const events=[],quotes=[];let redirects=0;
  const runner=createHostedCheckoutRunner({invoke:async()=>({data:{quoteChanged:true,shippingCents:499}}),
    track:(e)=>events.push(e),redirect:()=>redirects++});
  const result=await runner.start({buildRequestBody:()=>({}),beginCheckoutPayload:{},onQuoteChanged:c=>quotes.push(c)});
  assert.equal(result.kind,'failed');assert.deepEqual(quotes,[499]);assert.equal(redirects,0);assert.ok(!events.includes('begin_checkout'));
});
test('migration defaults disabled/empty; SQL uses one row lock and no client grants',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20261009051116_capped_us_shipping_offer.sql',import.meta.url),'utf8');
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);assert.match(sql,/DEFAULT '\{\}'::jsonb/);
  assert.match(sql,/WHERE id = 'us-standard-20261009' FOR UPDATE/);
  assert.match(sql,/state <> 'released'\) >= 10/);assert.match(sql,/IF r.state = 'paid' THEN RETURN/);
  assert.ok(!sql.includes('SECURITY DEFINER'));assert.match(sql,/FROM PUBLIC, anon, authenticated/);
  const checkout=fs.readFileSync(new URL('../src/pages/Checkout.tsx',import.meta.url),'utf8');
  assert.match(checkout,/shippingCost, analyticsConsent: getAnalyticsConsent\(\)/);
});
test('ended attempt requires buyer review without releasing an uncertain slot',async()=>{
  const f=fixture();await f.run();const row=[...f.rows.values()][0];
  row.expires_at_seconds=now-1;
  await assert.rejects(f.run(),/needs confirmation/);
  assert.equal(row.state,'reserved');assert.equal(f.sessions.size,1);
  const session=[...f.sessions.values()][0];session.status='expired';session.payment_status='unpaid';
  assert.deepEqual(await f.run(),{quoteChanged:true,shippingCents:499});
  assert.equal(row.state,'released');
  row.state='released';assert.deepEqual(await f.run(),{quoteChanged:true,shippingCents:499});
  row.state='paid';await assert.rejects(f.run(),/already paid/);
});
test('legacy frontend retains normal checkout instead of an unknown quote handshake',()=>{
  const source=fs.readFileSync(new URL('../supabase/functions/create-checkout/index.ts',import.meta.url),'utf8');
  assert.match(source,/offerEnabled && validationResult.data.expectedShippingCents === 499/);
});

test('delayed/paid completion after local expiry cannot invite duplicate checkout',async()=>{
  for (const paymentStatus of ['unpaid','paid']) {
    const f=fixture();await f.run();const row=[...f.rows.values()][0];
    row.expires_at_seconds=now-1;
    const session=[...f.sessions.values()][0];session.status='complete';session.payment_status=paymentStatus;
    await assert.rejects(f.run(),/needs confirmation/);
    assert.equal(f.sessions.size,1);assert.equal(row.state,paymentStatus==='paid'?'paid':'reserved');
  }
  const f=fixture();await f.run();const row=[...f.rows.values()][0];
  row.expires_at_seconds=now-1;row.session_id=null;
  await assert.rejects(f.run(),/needs confirmation/);assert.equal(row.state,'reserved');
});

test('disabling issuance never invites a duplicate of an existing pending payment',async()=>{
  const f=fixture();await f.run();const session=[...f.sessions.values()][0];
  session.status='complete';session.payment_status='unpaid';
  await assert.rejects(createOfferCheckout({db:f.db,stripe:f.stripe,enabled:false,origin:'https://www.snapcase.ai'},
    {request:f.request,email:'fixture@example.test',userId:null,provider:'printful',synthetic:false}),/needs confirmation/);
  assert.equal(f.sessions.size,1);assert.equal([...f.rows.values()][0].state,'reserved');
});
