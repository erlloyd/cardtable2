import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import GameSelect from './pages/GameSelect';
import Table from './pages/Table';
import DiagnosticTest from './pages/DiagnosticTest';

const router = createBrowserRouter([
  {
    path: '/',
    element: <GameSelect />,
  },
  {
    path: '/table/:id',
    element: <Table />,
  },
  {
    path: '/diagnostic',
    element: <DiagnosticTest />,
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
