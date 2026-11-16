import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { AvatarConfig, MapId, ScenePreset, UserProfileDoc } from '../types/metaverse';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firebase Firestore appears offline. Check firebase-applet-config.json.');
    }
  }
}
testConnection();

export function subscribeAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'scene_default';
}

function sanitizeAvatarForFirestore(avatar: AvatarConfig): AvatarConfig {
  return {
    skinColor: String(avatar.skinColor || '#FCD5B5').slice(0, 16),
    hairStyle: String(avatar.hairStyle || 'bob').slice(0, 32),
    hairColor: String(avatar.hairColor || '#2C2623').slice(0, 16),
    eyeStyle: String(avatar.eyeStyle || 'smile').slice(0, 32),
    outfitStyle: String(avatar.outfitStyle || 'hoodie').slice(0, 32),
    outfitColor: String(avatar.outfitColor || '#FF5A36').slice(0, 16),
    accessory: String(avatar.accessory || 'none').slice(0, 32),
  };
}

export async function loadUserProfileFromCloud(uid: string): Promise<UserProfileDoc | null> {
  const path = `profiles/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'profiles', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfileDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveUserProfileToCloud(
  uid: string,
  displayName: string,
  preferredMapId: MapId,
  avatar: AvatarConfig
): Promise<void> {
  const path = `profiles/${uid}`;
  const validMap = ['sunset-rooftop', 'gallery-theater', 'forest-cabin'].includes(preferredMapId)
    ? preferredMapId
    : 'sunset-rooftop';
  const cleanName = displayName.trim().slice(0, 32) || '旅人';
  const cleanAvatar = sanitizeAvatarForFirestore(avatar);

  try {
    const ref = doc(db, 'profiles', uid);
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        ownerUid: uid,
        displayName: cleanName,
        preferredMapId: validMap,
        avatar: cleanAvatar,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        ref,
        {
          ownerUid: uid,
          displayName: cleanName,
          preferredMapId: validMap,
          avatar: cleanAvatar,
          createdAt: existingSnap.data().createdAt,
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveScenePresetToCloud(preset: {
  sceneId: string;
  ownerUid: string;
  roomName: string;
  mapId: MapId;
  furniture: ScenePreset['furniture'];
  defaultVideoUrl: string;
  isPublic: boolean;
}): Promise<ScenePreset> {
  const cleanSceneId = sanitizeId(preset.sceneId);
  const path = `scenes/${cleanSceneId}`;
  const validMap = ['sunset-rooftop', 'gallery-theater', 'forest-cabin'].includes(preset.mapId)
    ? preset.mapId
    : 'sunset-rooftop';
  const cleanFurniture = preset.furniture.slice(0, 40).map((f) => ({
    id: String(f.id).slice(0, 40),
    type: f.type,
    x: Math.round(Number(f.x) || 0),
    y: Math.round(Number(f.y) || 0),
    sittable: Boolean(f.sittable),
    label: f.label ? String(f.label).slice(0, 32) : undefined,
  }));

  try {
    const ref = doc(db, 'scenes', cleanSceneId);
    const existingSnap = await getDoc(ref);
    const payload = {
      sceneId: cleanSceneId,
      ownerUid: preset.ownerUid,
      roomName: preset.roomName.trim().slice(0, 48) || '我的共看空间',
      mapId: validMap,
      furniture: cleanFurniture,
      defaultVideoUrl: String(preset.defaultVideoUrl || '').slice(0, 512),
      isPublic: Boolean(preset.isPublic),
      createdAt: existingSnap.exists() ? existingSnap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function listUserScenesFromCloud(uid: string): Promise<ScenePreset[]> {
  const path = 'scenes';
  try {
    const q = query(collection(db, 'scenes'), where('ownerUid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ScenePreset);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteScenePresetFromCloud(sceneId: string): Promise<void> {
  const cleanSceneId = sanitizeId(sceneId);
  const path = `scenes/${cleanSceneId}`;
  try {
    await deleteDoc(doc(db, 'scenes', cleanSceneId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
