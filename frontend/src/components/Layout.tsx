import { Outlet } from 'react-router-dom';
import { DataProvider } from '../contexts/DataContext';
import styles from '../styles/Layout.module.css';

const Layout = () => {
  return (
    <DataProvider>
      <div className={styles.appLayout}>
        <Outlet />
      </div>
    </DataProvider>
  );
};

export default Layout; 