// Confirmation and message dialogs that work everywhere. React Native's Alert
// does nothing in a web browser, so on the web these use the browser's own
// confirm()/alert() instead.
import { Alert, Platform } from 'react-native';

export function confirmAction({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
}) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    { text: confirmText, style: 'destructive', onPress: onConfirm },
  ]);
}

export function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
