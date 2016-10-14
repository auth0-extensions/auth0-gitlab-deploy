export default function normalizeErrorMiddleware() {
  return () => next => action => {
    if (action && action.type.endsWith('_REJECTED') && action.payload) {
      // Try to get the default error message from the response.
      let errorMessage = action.payload.statusText || action.payload.status || 'Unknown Server Error';

      // Maybe some data is available.
      let error = (action.payload.data && action.payload.data.error) || action.payload.error;
      if (!error) {
        error = action.payload.response && action.payload.response.data;
      }

      if (error) {
        errorMessage = error.message || error;
      }

      action.errorMessage = errorMessage; // eslint-disable-line no-param-reassign
    }

    next(action);
  };
}
