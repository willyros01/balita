package io.github.willyros01.wire;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.time.Instant;
import java.util.Map;

/** Only an explicit tap opens the article. Data-only FCM avoids duplicate SDK banners. */
public final class WireFcmService extends FirebaseMessagingService {
  private static final String CHANNEL="wire_breaking";

  @Override
  public void onNewToken(String token) {
    super.onNewToken(token);
    // Token renewal is reconciled with per-device Firestore identity on app resume.
    // Never create an ownerless subscription from a background service.
    getSharedPreferences("wire_fcm",Context.MODE_PRIVATE).edit()
      .putString("last_token",token).apply();
  }
  @Override
  public void onMessageReceived(RemoteMessage message) {
    final Map<String,String> data=message.getData();
    if(data==null)return;
    final String id=data.get("articleId");
    if(id==null || !id.matches("[a-zA-Z0-9-]{1,100}"))return;
    final String sentAt=data.get("sentAt");
    if(sentAt==null)return;
    try {
      long age=System.currentTimeMillis()-Instant.parse(sentAt).toEpochMilli();
      if(age<0 || age>1800000L)return;
    } catch(Exception ex) {return;}
    if(Build.VERSION.SDK_INT>=33 &&
        checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;

    NotificationManager manager=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
    if(manager==null)return;
    if(Build.VERSION.SDK_INT>=26) {
      NotificationChannel channel=new NotificationChannel(CHANNEL,"Wire breaking news",
        NotificationManager.IMPORTANCE_DEFAULT);
      manager.createNotificationChannel(channel);
    }
    Intent intent=new Intent(this,MainActivity.class);
    intent.setAction("io.github.willyros01.wire.OPEN."+id);
    intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
    intent.putExtra("wireArticleId",id);
    intent.putExtra("wireSentAt",sentAt);
    PendingIntent pending=PendingIntent.getActivity(this,id.hashCode(),intent,
      PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);

    String title=data.get("title");
    if(title==null||title.isBlank())title="Wire breaking news";
    String source=data.get("sourceName");
    NotificationCompat.Builder notice=new NotificationCompat.Builder(this,CHANNEL)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title).setContentText(source==null?"Wire":source)
      .setStyle(new NotificationCompat.BigTextStyle().bigText(title))
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setAutoCancel(true).setContentIntent(pending);
    manager.notify(id,0,notice.build());
  }
}
