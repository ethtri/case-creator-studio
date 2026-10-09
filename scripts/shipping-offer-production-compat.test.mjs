import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../supabase/functions/stripe-webhook/production-offer.ts',import.meta.url),'utf8');
const marker='us-standard-20261009';
test('compatibility handler preserves reference baseline outside declared offer/auth delta',()=>{
  let restored=source.slice(source.indexOf('import { serve }'));
  restored=restored.replace('await stripe.webhooks.constructEventAsync(payload, stripeSignature, webhookSecret, undefined, Stripe.createSubtleCryptoProvider())','stripe.webhooks.constructEvent(payload, stripeSignature, webhookSecret)');
  restored=restored.replace(/  \/\/ OFFER-COMPAT-EVENTS:[\s\S]*?  \/\/ END-OFFER-COMPAT-EVENTS/,`  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return new Response("Ignored", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;`);
  restored=restored.replace(/  \/\/ OFFER-COMPAT-LIFECYCLE:[\s\S]*?  \/\/ END-OFFER-COMPAT-LIFECYCLE\n\n/,'');
  assert.equal(createHash('sha256').update(restored).digest('hex'),'8c467737d384daf9edea4150db657bf0be81425e6def09b576c381459337fddf');
  assert.doesNotMatch(source,/sendOrderEmail|sendGa4|analytics_event_outbox|kexiaozhan|route-fulfillment-order/);
});
function fixture({offer=false,type='checkout.session.completed',currentStatus='complete',currentPayment='paid',signatureValid=true,reconcileFails=false}={}) {
  let handler,signatureChecks=0,dbCreated=0,reconciliations=0;const updates=[];
  const event={type,data:{object:{id:'cs_test_fixture',status:'complete',payment_status:'paid',amount_total:2999,
    metadata:offer?{shippingOfferId:marker}:{source:'snapcase_site'},payment_intent:'pi_fixture'}}};
  class Stripe { static createSubtleCryptoProvider(){return 'fixture-webcrypto';} constructor(){this.webhooks={constructEventAsync:async(...args)=>{assert.equal(args[4],'fixture-webcrypto');assert.equal(args[0],'fixture');signatureChecks++;if(!signatureValid)throw Error('signature');return event;}};}}
  const db={from(name){
    assert.equal(name,'orders');
    const chain={update(data){updates.push(data);return chain;},eq(){return chain;},select(){return chain;},single:async()=>({data:{},error:null})};
    return chain;
  }};
  const compiled=ts.transpileModule(source.replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  vm.runInNewContext(compiled,{serve:fn=>handler=fn,Stripe,createClient:()=>{dbCreated++;return db;},
    reconcileShippingOffer:async()=>{reconciliations++;if(reconcileFails)throw Error('reconcile');return {...event.data.object,status:currentStatus,payment_status:currentPayment};},
    SHIPPING_OFFER_ID:marker,Deno:{env:{get:name=>name==='STRIPE_MODE'?'live':'fixture-placeholder'}},Response,
    console:{error(){},warn(){},log(){}},fetch:()=>{throw Error('Unexpected provider request');}});
  return {updates,get signatureChecks(){return signatureChecks;},get dbCreated(){return dbCreated;},get reconciliations(){return reconciliations;},
    invoke(signature='fixture-signature'){return handler(new Request('https://example.test/stripe-webhook',{method:'POST',headers:signature?{'stripe-signature':signature}:{},body:'fixture'}));}};
}
test('signature rejection precedes all database and offer work',async()=>{
  const missing=fixture();assert.equal((await missing.invoke('')).status,400);assert.equal(missing.dbCreated,0);
  const invalid=fixture({signatureValid:false});assert.equal((await invalid.invoke()).status,400);assert.equal(invalid.signatureChecks,1);assert.equal(invalid.dbCreated,0);
});
test('ordinary completed checkout preserves existing order update; unrelated events stay ignored',async()=>{
  const normal=fixture();assert.equal((await normal.invoke()).status,200);assert.equal(normal.reconciliations,0);assert.equal(normal.updates[0].status,'paid');
  for(const type of ['checkout.session.expired','checkout.session.async_payment_failed','refund.created']){
    const f=fixture({type});assert.equal((await f.invoke()).status,200);assert.equal(f.updates.length,0);assert.equal(f.reconciliations,0);
  }
});
test('offer uses current provider state before fulfillment and holds unknown outcomes',async()=>{
  for(const [status,payment] of [['complete','unpaid'],['open','unpaid'],['expired','unpaid']]){
    const f=fixture({offer:true,currentStatus:status,currentPayment:payment});assert.equal((await f.invoke()).status,200);assert.equal(f.reconciliations,1);assert.equal(f.updates.length,0);
  }
  const failed=fixture({offer:true,reconcileFails:true});assert.equal((await failed.invoke()).status,500);assert.equal(failed.updates.length,0);
  const paid=fixture({offer:true,type:'checkout.session.async_payment_succeeded'});assert.equal((await paid.invoke()).status,200);assert.equal(paid.reconciliations,1);assert.equal(paid.updates[0].status,'paid');
});
