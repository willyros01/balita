# Wire 0.17.21 notification repair

Opening an enabled installation rebuilds its browser/FCM subscription once and saves the replacement token to the same device document. Anonymous authentication restoration completes before choosing the device identity. Registration errors now appear in Settings instead of leaving an unqualified On status.

FCM sends include visible notification text and the existing exact article ID. The native service-worker push listener remains the only display owner; no Firebase background auto-display handler is installed. Legacy data-only messages remain supported. The last receipt/display-request result is stored locally and shown in notification settings on return. Browser acceptance of showNotification is not proof the user saw a banner.

Sender logs report FCM acceptance with message IDs; failures no longer disappear behind a green notification step. No acceptance from any token fails the step. State is saved even on notification-step failure. Feed fetching remains every 30 minutes; approved sources, publisher marker policy, and rolling 30-minute alert limit are unchanged.

Validation: local tests cover single display with combined payload, legacy payload, display rejection diagnostics, and strict source/marker filtering. Physical-device delivery remains unverified. Open Wire 0.17.21 on each device before testing to repair its address. Then background the app and run the manual Inquirer test after the rolling interval. Check banner receipt, exact article navigation, and Settings receipt/display evidence separately.
