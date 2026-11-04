/** Commissions are policy calculations only. No provider charge or approved production rates. */
export const DAY_MS = 86400000;
const requireValue = (condition,message) => { if (!condition) throw new Error(message); };
export function selectSchedule(schedules, {country,currency,plan,category,periodStart}) {
 const matches=schedules.filter(rule=>rule.approved===true&&rule.country===country&&rule.currency===currency&&rule.plan===plan&&rule.category===category&&rule.effectiveFrom<=periodStart&&(rule.effectiveTo==null||periodStart<rule.effectiveTo));
 requireValue(matches.length===1,'Exactly one approved effective schedule required');
 return matches[0];
}
/** Tiers have exclusive upper boundary in minor units and integer basis points; rounding once avoids per-tier loss. */
export function progressiveCommission(amountMinor, tiers) {
 requireValue(Number.isSafeInteger(amountMinor)&&amountMinor>=0,'Invalid revenue minor units');
 requireValue(Array.isArray(tiers)&&tiers.length>0,'Missing commission tiers');
 let lower=0,weighted=0n,covered=false;
 for(let i=0;i<tiers.length;i++){
  const {upToMinor,rateBps}=tiers[i];
  requireValue(Number.isInteger(rateBps)&&rateBps>=0&&rateBps<=10000,'Invalid basis points');
  requireValue(upToMinor===null?i===tiers.length-1:Number.isSafeInteger(upToMinor)&&upToMinor>lower,'Tier boundaries must increase and unbounded tier must be last');
  const upper=upToMinor===null?amountMinor:Math.min(amountMinor,upToMinor);
  const taxable=Math.max(0,upper-lower);weighted+=BigInt(taxable)*BigInt(rateBps);
  if(upToMinor===null||amountMinor<=upToMinor)covered=true;
  if(upToMinor!==null)lower=upToMinor;
 }
 requireValue(covered,'Revenue exceeds approved schedule coverage');
 const result=Number((weighted+5000n)/10000n);
 requireValue(Number.isSafeInteger(result),'Commission overflow');return result;
}
export function monthlyCommission({revenueMinor,schedules,country,currency,plan,category,periodStart,periodEnd}){
 requireValue(Number.isSafeInteger(periodStart)&&Number.isSafeInteger(periodEnd)&&periodEnd>periodStart,'Invalid monthly period');
 const start=new Date(periodStart),end=new Date(periodEnd);
 requireValue(start.getUTCDate()===1&&start.getUTCHours()===0&&start.getUTCMinutes()===0&&start.getUTCSeconds()===0&&start.getUTCMilliseconds()===0,'Month must start at UTC boundary');
 requireValue(periodEnd===Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1),'Expected next UTC month boundary');
 const schedule=selectSchedule(schedules,{country,currency,plan,category,periodStart});
 return {amountMinor:progressiveCommission(revenueMinor,schedule.tiers),currency,scheduleId:schedule.id,periodStart,periodEnd,collectionMode:'manual',providerChargeCreated:false};
}
export function warehouseHolidayEligible(firstApprovedAt, now){
 requireValue(Number.isSafeInteger(firstApprovedAt)&&firstApprovedAt>=0&&Number.isSafeInteger(now)&&now>=firstApprovedAt,'Verified business activation time required');
 return now-firstApprovedAt<30*DAY_MS;
}
/** Returns a proposal only; trusted collector must independently verify persisted mandate and all holds. */
export function proposeCollection({invoice,adminEnabled,mandate,now}) {
 requireValue(typeof invoice?.id==='string'&&invoice.id.length>0&&typeof invoice.customerId==='string'&&invoice.customerId.length>0&&/^[A-Z]{3}$/.test(invoice.currency)&&invoice.status==='open'&&Number.isSafeInteger(invoice.amountMinor)&&invoice.amountMinor>0,'Open invoice required');
 requireValue(Number.isSafeInteger(now)&&Number.isSafeInteger(invoice.notifiedAt)&&now>=invoice.notifiedAt+7*DAY_MS,'Seven full notice days required');
 requireValue(adminEnabled===true,'Automatic collection disabled');
 requireValue(typeof mandate?.id==='string'&&mandate.id.length>0&&mandate.active===true&&mandate.customerId===invoice.customerId&&mandate.currency===invoice.currency&&Number.isSafeInteger(mandate.expiresAt)&&mandate.expiresAt>now,'Valid matching mandate required');
 requireValue(invoice.disputed===false&&invoice.onHold===false,'Disputes and holds block collection');
 return {invoiceId:invoice.id,amountMinor:invoice.amountMinor,currency:invoice.currency,mandateId:mandate.id,proposalOnly:true,providerChargeCreated:false};
}
export function pricingLab({revenueMinor,tiers,currency}){
 requireValue(/^[A-Z]{3}$/.test(currency),'Currency required');
 return {amountMinor:progressiveCommission(revenueMinor,tiers),currency,approved:false,simulation:true,providerChargeCreated:false};
}
