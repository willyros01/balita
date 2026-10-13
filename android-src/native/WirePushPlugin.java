package io.github.willyros01.wire;
import android.Manifest;
import android.content.Intent;
import android.os.Build;
import com.amazon.A3L.messaging.A3LMessaging;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
/* One bridge: A3L chooses native ADM on Fire OS, FCM on Google Android. */
@CapacitorPlugin(name="WirePush",permissions={
  @Permission(alias="wireNotice",strings={Manifest.permission.POST_NOTIFICATIONS})
})
public final class WirePushPlugin extends Plugin {
  private String provider() {
    try {
      final String p=String.valueOf(A3LMessaging.getCurrentPlatform(getContext()))
        .toUpperCase(java.util.Locale.ROOT);
      if(p.contains("ADM")) return "adm";
      if(p.contains("FCM")) return "fcm";
    } catch(Exception e) { android.util.Log.w("WirePush","Messaging provider unavailable",e); }
    return "";
  }
  @PluginMethod public void available(PluginCall call) {
    final String p=provider();
    JSObject ret=new JSObject();
    ret.put("supported", !p.isEmpty());
    ret.put("provider",p);
    call.resolve(ret);
  }
  private void issueToken(PluginCall call){
    final String p=provider();
    if(p.isEmpty()){
      call.reject("Neither ADM nor FCM is supported on this device.");
      return;
    }
    A3LMessaging.getToken().addOnCompleteListener(task->{
      if(!task.isSuccessful()||task.getResult()==null||task.getResult().isEmpty()){
        call.reject("Native notification registration did not supply a token");
        return;
      }
      JSObject ret=new JSObject();
      ret.put("provider",p);
      ret.put("token",task.getResult());
      call.resolve(ret);
    });
  }
  @PluginMethod public void register(PluginCall call){
    if(provider().isEmpty()){
      call.reject("No Amazon ADM or Google FCM notification service is available.");
      return;
    }
    if(Build.VERSION.SDK_INT>=33 &&
        getPermissionState("wireNotice")!=PermissionState.GRANTED){
      if(Boolean.TRUE.equals(call.getBoolean("silent",false))){
        call.reject("Notification permission is off. Enable it in Android Settings.");
        return;
      }
      requestPermissionForAlias("wireNotice",call,"permissionGranted");
    }else issueToken(call);
  }
  @PermissionCallback private void permissionGranted(PluginCall call){
    if(getPermissionState("wireNotice")!=PermissionState.GRANTED){
      call.reject("Notification permission not granted");
      return;
    }
    issueToken(call);
  }
  @PluginMethod public void takeRoute(PluginCall call){
    final Intent intent=getActivity().getIntent();
    JSObject ret=new JSObject();
    if(intent!=null){
      final String id=intent.getStringExtra("wireArticleId");
      final String sentAt=intent.getStringExtra("wireSentAt");
      intent.removeExtra("wireArticleId");
      intent.removeExtra("wireSentAt");
      if(id!=null&&id.matches("[a-zA-Z0-9-]{1,100}")){
        ret.put("articleId",id);
        ret.put("sentAt",sentAt==null?"":sentAt);
      }
    }
    call.resolve(ret);
  }
}
