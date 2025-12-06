// screens/Home.js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Contacts from './HomeScreens/Contacts';
import ChatScreen from './HomeScreens/ChatScreen';
import MyProfile from './HomeScreens/MyProfile';
import Calls from './HomeScreens/Calls';
import Forum from './HomeScreens/Forum';
import ForumComments from './HomeScreens/ForumComments';
import { Ionicons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();
const ContactStack = createNativeStackNavigator();
const ForumStack = createNativeStackNavigator();

function ContactNavigator() {
  return (
    <ContactStack.Navigator screenOptions={{ headerShown: false }}>
      <ContactStack.Screen name="ContactsList" component={Contacts} />
      <ContactStack.Screen name="ChatScreen" component={ChatScreen} />
    </ContactStack.Navigator>
  );
}


function ForumNavigator() {
  return (
    <ForumStack.Navigator screenOptions={{ headerShown: false }}>
      <ForumStack.Screen name="ForumList" component={Forum} />
      <ForumStack.Screen name="ForumComments" component={ForumComments} />
    </ForumStack.Navigator>
  );
}

export default function Home() {
  return (
    <Tab.Navigator
      initialRouteName="Contacts"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#25D366',
        tabBarInactiveTintColor: '#777',
        tabBarStyle: { 
          backgroundColor: '#fff', 
          height: 60, 
          paddingBottom: 6,
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0'
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600'
        },
        tabBarIcon: ({ color, size }) => {
          let iconName;
          
          if (route.name === 'Contacts') iconName = 'chatbubbles';
          else if (route.name === 'Forum') iconName = 'newspaper';
          else if (route.name === 'Calls') iconName = 'call';
          else if (route.name === 'Profile') iconName = 'person';
          
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Contacts" component={ContactNavigator} options={{ title: 'Discussions' }} />
      <Tab.Screen name="Forum" component={ForumNavigator} options={{ title: 'Forum' }} />
      <Tab.Screen name="Calls" component={Calls} options={{ title: 'Appels' }} />
      <Tab.Screen name="Profile" component={MyProfile} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  );
}