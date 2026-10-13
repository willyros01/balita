package io.github.willyros01.wire;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.amazon.A3L.messaging.A3LMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
public final class WireMessagingService extends A3LMessagingService {
  private static final String CHANNEL="wire_breaking";
  @Override public void onNewToken(Context context,String token){
    context.getSharedPreferences("wire_native",Context.MODE_PRIVATE)
      .edit().putString("last_token",token).apply();
  }
  @Override public void onMessageReceived(Context context,RemoteMessage message){
    final Map<String,String> data=message.getData();
    final String id=data.get("articleId");
    if(id==null||!id.matches("[a-zA-Z0-9-]{1,100}"))return;
    final String sentAt=data.get("sentAt");
    try{
      if(sentAt==null)return;
      long delta=System.currentTimeMillis()-java.time.Instant.parse(sentAt).toEpochMilli();
      if(delta<0||delta>1800000L)return;
    }catch(Exception err){return;}
    NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
    if(manager==null)return;
    if(Build.VERSION.SDK_INT>=26){
      NotificationChannel channel=new NotificationChannel(CHANNEL,"Wire breaking news",
        NotificationManager.IMPORTANCE_DEFAULT);
      manager.createNotificationChannel(channel);
    }
    Intent intent=new Intent(context,MainActivity.class);
    intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
    intent.putExtra("wireArticleId",id);
    intent.putExtra("wireSentAt",sentAt);
    PendingIntent pending=PendingIntent.getActivity(context,id.hashCode(),intent,
      PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    String title=data.get("title");
    if(title==null||title.isBlank())title="Breaking news";
    String source=data.get("sourceName");
    NotificationCompat.Builder note=new NotificationCompat.Builder(context,CHANNEL)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title).setContentText(source==null?"Wire":source)
      .setStyle(new NotificationCompat.BigTextStyle().bigText(title))
      .setAutoCancel(true).setContentIntent(pending);
    manager.notify(id.hashCode(),note.build());
  }
}
