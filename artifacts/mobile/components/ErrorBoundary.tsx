import React, { Component } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors } from '@/constants/colors';

interface State { hasError: boolean; error: string }

function errorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return String(error);
}

export class ErrorBoundary extends Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error: errorMessage(error) };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Campaign Error</Text>
          <Text style={styles.msg}>{this.state.error}</Text>
          <Pressable onPress={() => this.setState({ hasError: false, error: '' })} style={styles.btn}>
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 22, marginBottom: 16 },
  msg: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  btn: { backgroundColor: Colors.gold, paddingVertical: 12, paddingHorizontal: 32 },
  btnText: { color: Colors.bg, fontFamily: 'Alegreya_700Bold', fontSize: 14 },
});
