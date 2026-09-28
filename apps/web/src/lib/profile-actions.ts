"use server";

import {
  createLearnerAction as createLearner,
  deactivateLearnerAction as deactivateLearner,
  enterLearnerAction as enterLearner,
  replaceLearnerAuthorizationsAction as replaceLearnerAuthorizations,
  restoreLearnerAction as restoreLearner,
  returnToAccountAction as returnToAccount,
  selectProfileAction as selectProfile,
  switchLearnerAction as switchLearner,
  updateCurrentLearnerAction as updateCurrentLearner,
  updateLearnerAction as updateLearner,
  updateSwitchPasswordAction as updateSwitchPassword,
  uploadLearnerAvatarAction as uploadLearnerAvatar,
  uploadCurrentLearnerAvatarAction as uploadCurrentLearnerAvatar,
  type ProfileActionState
} from "@/lib/profile-api";

export async function createLearnerAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return createLearner(previousState, formData);
}

export async function updateLearnerAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return updateLearner(previousState, formData);
}

export async function uploadLearnerAvatarAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return uploadLearnerAvatar(previousState, formData);
}

export async function updateCurrentLearnerAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return updateCurrentLearner(previousState, formData);
}

export async function uploadCurrentLearnerAvatarAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return uploadCurrentLearnerAvatar(previousState, formData);
}

export async function replaceLearnerAuthorizationsAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return replaceLearnerAuthorizations(previousState, formData);
}

export async function deactivateLearnerAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return deactivateLearner(previousState, formData);
}

export async function restoreLearnerAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return restoreLearner(previousState, formData);
}

export async function updateSwitchPasswordAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return updateSwitchPassword(previousState, formData);
}

export async function selectProfileAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return selectProfile(previousState, formData);
}

export async function enterLearnerAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return enterLearner(previousState, formData);
}

export async function switchLearnerAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return switchLearner(previousState, formData);
}

export async function returnToAccountAction(
  previousState: ProfileActionState,
  formData: FormData
) {
  return returnToAccount(previousState, formData);
}
