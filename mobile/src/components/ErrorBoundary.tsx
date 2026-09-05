import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[GravityDesk] Uncaught error in component tree:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>GravityDesk Encountered an Error</Text>
            <Text style={styles.headerSubtitle}>
              A runtime component error occurred. Details below:
            </Text>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.errorCard}>
              <Text style={styles.errorLabel}>ERROR MESSAGE</Text>
              <Text style={styles.errorText}>
                {this.state.error ? this.state.error.toString() : "Unknown error"}
              </Text>
            </View>

            {this.state.errorInfo?.componentStack && (
              <View style={styles.stackCard}>
                <Text style={styles.stackLabel}>COMPONENT STACK</Text>
                <Text style={styles.stackText}>
                  {this.state.errorInfo.componentStack}
                </Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.reloadBtn} onPress={this.handleReload}>
            <Text style={styles.reloadBtnText}>Try Again / Reload Screen</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#141414",
    padding: 16,
    paddingTop: 48,
    gap: 16,
  },
  header: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f85149",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#8b949e",
    marginTop: 4,
  },
  body: {
    flex: 1,
  },
  errorCard: {
    backgroundColor: "rgba(248, 81, 73, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(248, 81, 73, 0.4)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorLabel: {
    fontSize: 10,
    color: "#f85149",
    fontWeight: "700",
    fontFamily: "monospace",
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: "#ffffff",
    fontFamily: "monospace",
    lineHeight: 18,
  },
  stackCard: {
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 8,
    padding: 12,
  },
  stackLabel: {
    fontSize: 10,
    color: "#8b949e",
    fontWeight: "700",
    fontFamily: "monospace",
    marginBottom: 4,
  },
  stackText: {
    fontSize: 11,
    color: "#737373",
    fontFamily: "monospace",
    lineHeight: 16,
  },
  reloadBtn: {
    backgroundColor: "#1f6feb",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  reloadBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
});
