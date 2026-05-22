export const convertToSectionList = (array, groupByKey) => {
  return Object.values(
    array.reduce((acc, item) => {
      const key = item[groupByKey];

      if (!acc[key]) {
        acc[key] = {
          title: key,
          data: [],
        };
      }

      acc[key].data.push(item);

      return acc;
    }, {}),
  );
};