type InitializationStatus = "idle" | "in_flight" | "initialized";

type InitializationState = {
  key: string | null;
  status: InitializationStatus;
};

export const createEditorInitializationGuard = () => {
  let state: InitializationState = { key: null, status: "idle" };

  return {
    begin(key: string) {
      if (
        state.status === "initialized" ||
        (state.key === key && state.status === "in_flight")
      ) {
        return false;
      }

      state = { key, status: "in_flight" };
      return true;
    },
    isCurrent(key: string) {
      return state.key === key && state.status === "in_flight";
    },
    complete(key: string) {
      if (state.key === key && state.status === "in_flight") {
        state = { key, status: "initialized" };
      }
    },
    fail(key: string) {
      if (state.key === key && state.status === "in_flight") {
        state = { key: null, status: "idle" };
      }
    },
  };
};
