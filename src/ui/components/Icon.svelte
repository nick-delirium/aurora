<script lang="ts">
  import { ICONS, type IconName } from '../icons';

  let { name, class: cls = '' }: { name: IconName; class?: string } = $props();
</script>

<svg
  class="icon {cls}"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true">{@html ICONS[name]}</svg
>
