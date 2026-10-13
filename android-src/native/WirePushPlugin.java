package io.github.willyros01.wire;
import android.Manifest;
import android.content.Intent;
import android.os.Build;
import com.amazon.A3L.messaging.A3LMessaging;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
@CapacitorPlugin(name="WirePush",permissions={
  @Permission(alias="wireNotice",strings={Manifest.permission.POST_NOTIFICATIONS})
})
public final class WirePushPlugin extends Plugin {
  private void issueToken(PluginCall call){
    final String platform=A3LMessaging.getCurrentPlatform(getContext());
    final String route=String.valueOf(platform).toUpperCase(java.util.Locale.ROOT);
    if(!route.contains("ADM")&&!route.contains("FCM")){
      call.reject("No supported ADM or FCM service is available on this device");
      return;
    }
    final String provider=route.contains("ADM")?"adm":"fcm";
    A3LMessaging.getToken().addOnCompleteListener(task->{
      if(!task.isSuccessful()||task.getResult()==null||task.getResult().isEmpty()){
        call.reject("Native notification registration did not supply a token");
        return;
      }
      JSObject ret=new JSObject();
      ret.put("provider",provider);
      ret.put("token",task.getResult());
      call.resolve(ret);
    });
  }
  @PluginMethod
  public void register(PluginCall call){
    if(Build.VERSION.SDK_INT>=33&&getPermissionState("wireNotice")!=
        com.getcapacitor.PermissionState.GRANTED){
      requestPermissionForAlias("wireNotice",call,"permissionGranted");
    }else issueToken(call);
  }
  @PermissionCallback
  private void permissionGranted(PluginCall call){
    if(getPermissionState("wireNotice")!=com.getcapacitor.PermissionState.GRANTED){
      call.reject("Notification permission not granted");
      return;
    }
    issueToken(call);
  }
  @PluginMethod
  public void takeRoute(PluginCall call){
    // Delivery alone cannot open a story. Only an explicit notification tap
    // supplies these activity intent extras.
    final Intent intent=getActivity().getIntent();
    if(intent==null){call.resolve(new JSObject());return;}
    final String id=intent.getStringExtra("wireArticleId");
    final String sentAt=intent.getStringExtra("wireSentAt");
    intent.removeExtra("wireArticleId");
    intent.removeExtra("wireSentAt");
    JSObject ret=new JSObject();
    if(id!=null&&id.matches("[a-zA-Z0-9-]{1,100}")){
      ret.put("articleId",id);
      ret.put("sentAt",sentAt==null?"":sentAt);
    }
    call.resolve(ret);
  }
}
