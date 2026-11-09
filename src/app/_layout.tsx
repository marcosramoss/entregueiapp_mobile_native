import { Tabs } from 'expo-router';
import { Banknote, Bike, MapPin } from 'lucide-react-native';
import { SelectedDateProvider } from '../context/SelectedDateContext';

export default function RootLayout() {
  return (
    <SelectedDateProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#4ade80',
          tabBarInactiveTintColor: '#91a0b5',
          tabBarStyle: {
            backgroundColor: '#101a2b',
            borderTopColor: '#263449',
            height: 72,
            paddingTop: 8,
            paddingBottom: 12,
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Entregas',
            tabBarIcon: ({ color, size }) => <Bike color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="neighborhoods"
          options={{
            title: 'Bairros',
            tabBarIcon: ({ color, size }) => <MapPin color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="earnings"
          options={{
            title: 'Ganhos',
            tabBarIcon: ({ color, size }) => <Banknote color={color} size={size} />,
          }}
        />
      </Tabs>
    </SelectedDateProvider>
  );
}
