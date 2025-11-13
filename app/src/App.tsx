import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import GameSelect from './pages/GameSelect';
import Table from './pages/Table';

const router = createBrowserRouter([
  {
    path: '/',
    element: <GameSelect />,
  },
  {
    path: '/table/:id',
    element: <Table />,
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
