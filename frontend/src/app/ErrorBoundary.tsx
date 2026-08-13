import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "../components/primitives/Button";
import { Callout } from "../components/primitives/Callout";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <Callout tone="danger" title="The workspace failed to render">
          <p>{this.state.error.message}</p>
          <Button onClick={() => this.setState({ error: null })}>Try again</Button>
        </Callout>
      );
    }
    return this.props.children;
  }
}
