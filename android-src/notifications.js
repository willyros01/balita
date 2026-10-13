/* Android reading-preview notification boundary.
 * Web Push cannot work in a Capacitor WebView. Do not silently subscribe or
 * claim "on". Native A3L FCM/ADM requires provisioned credentials and SDK.
 */
export function setup({announce}){
 const button=document.getElementById('breaking-toggle');
 const status=document.getElementById('breaking-status');
 if(!button||!status)return;
 button.textContent='Not available yet';
 button.disabled=true;
 button.setAttribute('aria-pressed','false');
 status.textContent='Native Android notifications are not configured yet. News reading still works.';
}
