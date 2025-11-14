import { createFileRoute } from '@tanstack/react-router';
import DiagnosticTest from '../pages/DiagnosticTest';

export const Route = createFileRoute('/diagnostic')({
  component: DiagnosticTest,
});
