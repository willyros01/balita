package io.github.willyros01.wire;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.firebase.messaging.FirebaseMessaging;

/** Google Android FCM only. Amazon ADM is a separate, disabled integration. */
@CapacitorPlugin(name="WirePush",permissions={
  @Permission(alias="wireNotice",strings={Manifest.permission.POST_NOTIFICATIONS})
})
public final class WireFcmPlugin extends Plugin {
  private boolean supported() {
    return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext())
      == ConnectionResult.SUCCESS;
  }
  @PluginMethod
  public void available(PluginCall call) {
    JSObject answer = new JSObject();
    answer.put("supported",supported());
    answer.put("provider","fcm");
    call.resolve(answer);
  }
  private void issueToken(PluginCall call) {
    if(!supported()) {
      call.reject("Google Play services are unavailable. Amazon Fire requires ADM.");
      return;
    }
    FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
      if(!task.isSuccessful() || task.getResult()==null || task.getResult().isEmpty()) {
        call.reject("Firebase did not issue an FCM registration token.");
        return;
      }
      JSObject result=new JSObject();
      result.put("provider","fcm");
      result.put("token",task.getResult());
      call.resolve(result);
    });
  }
  @PluginMethod
  public void register(PluginCall call) {
    if(!supported()) {
      call.reject("FCM is supported only on Google Android. Amazon Fire requires ADM.");
      return;
    }
    if(Build.VERSION.SDK_INT>=33 &&
        getPermissionState("wireNotice")!=PermissionState.GRANTED) {
      if(Boolean.TRUE.equals(call.getBoolean("silent",false))) {
        call.reject("Android notification permission is off; enable it in device Settings.");
        return;
      }
      requestPermissionForAlias("wireNotice",call,"permissionGranted");
    } else issueToken(call);
  }
  @PermissionCallback
  private void permissionGranted(PluginCall call) {
    if(getPermissionState("wireNotice")!=PermissionState.GRANTED) {
      call.reject("Notification permission denied.");
      return;
    }
    issueToken(call);
  }
  @PluginMethod
  public void takeRoute(PluginCall call) {
    final Intent intent=getActivity().getIntent();
    JSObject answer=new JSObject();
    if(intent!=null) {
      final String id=intent.getStringExtra("wireArticleId");
      final String sentAt=intent.getStringExtra("wireSentAt");
      intent.removeExtra("wireArticleId");
      intent.removeExtra("wireSentAt");
      if(id!=null && id.matches("[a-zA-Z0-9-]{1,100}")) {
        answer.put("articleId",id);
        answer.put("sentAt",sentAt==null?"":sentAt);
      }
    }
    call.resolve(answer);
  }
}
