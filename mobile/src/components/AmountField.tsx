import { StyleSheet, TextInput, View } from 'react-native';
import { useT } from '../i18n';
import { useColors } from '../settings';
import { radius, space } from '../theme';
import { Button, Label, Row, Text } from '../ui';

export default function AmountField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  suffix,
  onMax,
  keyboardType = 'decimal-pad',
  testID,
  error,
  autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
  suffix?: string;
  onMax?: () => void;
  keyboardType?: 'decimal-pad' | 'number-pad' | 'default';
  testID?: string;
  error?: string | null;
  autoCapitalize?: 'none' | 'characters';
}) {
  const colors = useColors();
  const t = useT();

  return (
    <View style={{ gap: space.xs }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>{label}</Label>
        {onMax ? (
          <Button
            title={t('common.max')}
            kind='quiet'
            onPress={onMax}
            testID={`${testID}-max`}
          />
        ) : null}
      </Row>
      <Row
        style={[
          styles.wrap,
          { backgroundColor: colors.cardRaised, borderColor: colors.border },
        ]}
        gap={space.sm}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          style={[styles.input, { color: colors.text }]}
        />
        {suffix ? (
          <Text variant='body' tone='faint'>
            {suffix}
          </Text>
        ) : null}
      </Row>
      {error ? (
        <Text variant='small' tone='bad' testID={`${testID}-error`}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant='small' tone='faint'>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
  },
  input: { flex: 1, fontSize: 18, paddingVertical: space.md },
});
