import {
  ArrayVector,
  DataFrame,
  Field,
  FieldType,
  getDisplayProcessor,
  getLinksSupplier,
  GrafanaTheme2,
  InterpolateFunction,
  isBooleanUnit,
  SortedVector,
  TimeRange,
} from '@grafana/data';
import { GraphFieldConfig, LineInterpolation } from '@grafana/schema';
import { applyNullInsertThreshold } from '@grafana/ui/src/components/GraphNG/nullInsertThreshold';
import { nullToValue } from '@grafana/ui/src/components/GraphNG/nullToValue';

/**
 * Returns null if there are no graphable fields
 */
export function prepareGraphableFields(
  series: DataFrame[],
  theme: GrafanaTheme2,
  timeRange?: TimeRange
): DataFrame[] | null {
  if (!series?.length) {
    return null;
  }

  let copy: Field;

  const frames: DataFrame[] = [];

  for (let frame of series) {
    const fields: Field[] = [];

    let hasTimeField = false;
    let hasValueField = false;

    let nulledFrame = applyNullInsertThreshold({
      frame,
      refFieldPseudoMin: timeRange?.from.valueOf(),
      refFieldPseudoMax: timeRange?.to.valueOf(),
    });

    for (const field of nullToValue(nulledFrame).fields) {
      switch (field.type) {
        case FieldType.time:
          hasTimeField = true;
          fields.push(field);
          break;
        case FieldType.number:
          hasValueField = true;
          copy = {
            ...field,
            values: new ArrayVector(
              field.values.toArray().map((v) => {
                if (!(Number.isFinite(v) || v == null)) {
                  return null;
                }
                return v;
              })
            ),
          };

          fields.push(copy);
          break; // ok
        case FieldType.string:
          copy = {
            ...field,
            values: new ArrayVector(field.values.toArray()),
          };

          fields.push(copy);
          break; // ok
        case FieldType.boolean:
          hasValueField = true;
          const custom: GraphFieldConfig = field.config?.custom ?? {};
          const config = {
            ...field.config,
            max: 1,
            min: 0,
            custom,
          };

          // smooth and linear do not make sense
          if (custom.lineInterpolation !== LineInterpolation.StepBefore) {
            custom.lineInterpolation = LineInterpolation.StepAfter;
          }

          copy = {
            ...field,
            config,
            type: FieldType.number,
            values: new ArrayVector(
              field.values.toArray().map((v) => {
                if (v == null) {
                  return v;
                }
                return Boolean(v) ? 1 : 0;
              })
            ),
          };

          if (!isBooleanUnit(config.unit)) {
            config.unit = 'bool';
            copy.display = getDisplayProcessor({ field: copy, theme });
          }

          fields.push(copy);
          break;
      }
    }

    if (hasTimeField && hasValueField) {
      frames.push({
        ...frame,
        length: nulledFrame.length,
        fields,
      });
    }
  }

  if (frames.length) {
    return frames;
  }

  return null;
}

export function getTimezones(timezones: string[] | undefined, defaultTimezone: string): string[] {
  if (!timezones || !timezones.length) {
    return [defaultTimezone];
  }
  return timezones.map((v) => (v?.length ? v : defaultTimezone));
}

export function regenerateLinksSupplier(
  alignedDataFrame: DataFrame,
  frames: DataFrame[],
  replaceVariables: InterpolateFunction,
  timeZone: string
): DataFrame {
  alignedDataFrame.fields.forEach((field) => {
    const frameIndex = field.state?.origin?.frameIndex;

    if (frameIndex === undefined) {
      return;
    }

    const frame = frames[frameIndex];
    const tempFields: Field[] = [];

    /* check if field has sortedVector values
      if it does, sort all string fields in the original frame by the order array already used for the field
      otherwise just attach the fields to the temporary frame used to get the links
    */
    for (const frameField of frame.fields) {
      if (frameField.type === FieldType.string) {
        if (field.values instanceof SortedVector) {
          const copiedField = { ...frameField };
          copiedField.values = new SortedVector(frameField.values, field.values.getOrderArray());
          tempFields.push(copiedField);
        } else {
          tempFields.push(frameField);
        }
      }
    }

    console.log(alignedDataFrame, tempFields);
    const tempFrame: DataFrame = {
      fields: [...alignedDataFrame.fields, ...tempFields],
      length: alignedDataFrame.fields.length + tempFields.length,
    };

    field.getLinks = getLinksSupplier(tempFrame, field, field.state!.scopedVars!, replaceVariables, timeZone);
  });

  return alignedDataFrame;
}
